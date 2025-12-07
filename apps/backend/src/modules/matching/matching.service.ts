import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LocationsService } from '../locations/locations.service';
import {
  OsrmService,
  Coordinates,
  RouteResult,
} from '../../common/osrm/osrm.service';
import { RedisService, GeoMember } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DriverStatus, DriverApprovalStatus } from '@prisma/client';

export interface MatchCandidate {
  driverId: string;
  distance: number; // meters from origin
  coordinates: Coordinates;
  pickupEta: RouteResult;
  tripEta: RouteResult;
  score: number;
}

export interface MatchRequest {
  origin: Coordinates;
  destination: Coordinates;
  radiusMeters?: number;
  maxCandidates?: number;
}

export interface MatchResult {
  candidates: MatchCandidate[];
  bestMatch: MatchCandidate | null;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  // Scoring weights
  private readonly PICKUP_WEIGHT = 0.7;
  private readonly TRIP_WEIGHT = 0.3;

  // Default search parameters
  private readonly DEFAULT_RADIUS_M = 5000; // 5km
  private readonly MAX_RADIUS_M = 15000; // 15km
  private readonly DEFAULT_MAX_CANDIDATES = 5;

  constructor(
    private readonly locationsService: LocationsService,
    private readonly prisma: PrismaService,
    private readonly osrmService: OsrmService,
    private readonly redis: RedisService
  ) {}

  /**
   * Find and score nearby drivers for a ride request
   * Uses Redis GEO for proximity search and OSRM for ETA calculation
   */
  async findMatches(request: MatchRequest): Promise<MatchResult> {
    const startTime = Date.now();
    const {
      origin,
      destination,
      radiusMeters = this.DEFAULT_RADIUS_M,
      maxCandidates = this.DEFAULT_MAX_CANDIDATES,
    } = request;

    this.logger.debug(
      `Finding matches: origin=${origin.lat},${origin.lon}, radius=${radiusMeters}m`
    );

    // Step 1: Get nearby drivers from Redis GEO
    const nearbyDrivers = await this.locationsService.getNearbyDrivers(
      origin.lat,
      origin.lon,
      radiusMeters,
      maxCandidates * 2 // Get more candidates to filter
    );

    if (nearbyDrivers.length === 0) {
      this.logger.debug('No nearby drivers found');
      return { candidates: [], bestMatch: null };
    }

    this.logger.debug(`Found ${nearbyDrivers.length} nearby drivers`);

    // Step 2: Filter to only ONLINE drivers (not BUSY)
    const availableDrivers = await this.filterAvailableDrivers(nearbyDrivers);

    if (availableDrivers.length === 0) {
      this.logger.debug('No available drivers (all busy or offline)');
      return { candidates: [], bestMatch: null };
    }

    // Step 3: Calculate ETAs using OSRM and score candidates
    const candidates = await this.scoreAndRankCandidates(
      availableDrivers,
      origin,
      destination,
      maxCandidates
    );

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      `Matching completed in ${elapsed}ms, found ${candidates.length} candidates`
    );

    return {
      candidates,
      bestMatch: candidates.length > 0 ? candidates[0] : null,
    };
  }

  /**
   * Expand search radius and try again if no matches found
   */
  async findMatchesWithExpansion(request: MatchRequest): Promise<MatchResult> {
    let radiusMeters = request.radiusMeters || this.DEFAULT_RADIUS_M;

    // Try with initial radius
    let result = await this.findMatches({ ...request, radiusMeters });

    // If no matches, try expanding radius
    if (result.candidates.length === 0 && radiusMeters < this.MAX_RADIUS_M) {
      radiusMeters = Math.min(radiusMeters * 2, this.MAX_RADIUS_M);
      this.logger.debug(`Expanding search radius to ${radiusMeters}m`);
      result = await this.findMatches({ ...request, radiusMeters });
    }

    return result;
  }

  /**
   * Get the next best candidate after a driver declines
   */
  async getNextCandidate(
    request: MatchRequest,
    excludeDriverIds: string[]
  ): Promise<MatchCandidate | null> {
    const result = await this.findMatches(request);

    const availableCandidates = result.candidates.filter(
      (c) => !excludeDriverIds.includes(c.driverId)
    );

    return availableCandidates.length > 0 ? availableCandidates[0] : null;
  }

  /**
   * Filter drivers to only include those with ONLINE status and APPROVED
   * Uses a single batch query instead of N+1 sequential queries
   */
  private async filterAvailableDrivers(
    drivers: GeoMember[]
  ): Promise<GeoMember[]> {
    if (drivers.length === 0) {
      return [];
    }

    const driverIds = drivers.map((d) => d.memberId);

    // Single batch query to get all online and approved drivers
    const availableDrivers = await this.prisma.driver.findMany({
      where: {
        id: { in: driverIds },
        status: DriverStatus.ONLINE,
        approvalStatus: DriverApprovalStatus.APPROVED,
      },
      select: { id: true },
    });

    const availableDriverIds = new Set(availableDrivers.map((d) => d.id));

    return drivers.filter((d) => availableDriverIds.has(d.memberId));
  }

  /**
   * Calculate OSRM ETAs and score candidates
   */
  private async scoreAndRankCandidates(
    drivers: GeoMember[],
    origin: Coordinates,
    destination: Coordinates,
    maxCandidates: number
  ): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];

    // Calculate ETAs in parallel for all candidates
    const etaPromises = drivers.map(async (driver) => {
      try {
        const driverLocation: Coordinates = {
          lat: driver.coordinates.lat,
          lon: driver.coordinates.lon,
        };

        const { pickup, trip } = await this.osrmService.getFullRouteEta(
          driverLocation,
          origin,
          destination
        );

        // Calculate score (lower is better)
        const score =
          pickup.durationSec * this.PICKUP_WEIGHT +
          trip.durationSec * this.TRIP_WEIGHT;

        return {
          driverId: driver.memberId,
          distance: driver.distance,
          coordinates: driverLocation,
          pickupEta: pickup,
          tripEta: trip,
          score,
        };
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          throw error; // Re-throw OSRM unavailable errors
        }
        this.logger.warn(
          `Failed to calculate ETA for driver ${driver.memberId}: ${error}`
        );
        return null;
      }
    });

    const results = await Promise.all(etaPromises);

    // Filter out failed calculations and sort by score
    for (const result of results) {
      if (result !== null) {
        candidates.push(result);
      }
    }

    // Sort by score (ascending - lower is better)
    candidates.sort((a, b) => a.score - b.score);

    // Return top candidates
    return candidates.slice(0, maxCandidates);
  }
}
