import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService, GeoMember } from '../../common/redis/redis.service';

export interface LocationUpdate {
  driverId: string;
  lat: number;
  lon: number;
  ts: number;
}

export interface LocationUpdateResult {
  updated: boolean;
  reason?: 'throttled' | 'invalid_coordinates';
  distanceMoved?: number;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  // Throttling: minimum distance (meters) before updating location
  private readonly minDistanceThresholdM: number;

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService
  ) {
    this.minDistanceThresholdM = this.configService.get<number>(
      'LOCATION_MIN_DISTANCE_M',
      10 // Default: 10 meters
    );
  }

  /**
   * Update driver location with throttling and batched Redis operations
   * Only updates if driver moved more than MIN_DISTANCE_THRESHOLD_M meters
   */
  async updateDriverLocation(
    update: LocationUpdate
  ): Promise<LocationUpdateResult> {
    const { driverId, lat, lon, ts } = update;

    // Validate coordinates
    if (!this.isValidCoordinate(lat, lon)) {
      this.logger.warn(
        `Invalid coordinates for driver ${driverId}: ${lat}, ${lon}`
      );
      return { updated: false, reason: 'invalid_coordinates' };
    }

    // Check if driver is in GEO set - if not, we MUST add them regardless of throttling
    const isInGeoSet = await this.redis.geoGetDriverPosition(driverId);

    // Throttling: check if driver moved enough distance (only if already in GEO set)
    const lastPosition = await this.redis.getDriverLastPosition(driverId);

    if (lastPosition && isInGeoSet) {
      // Only throttle if driver is already in GEO set
      const distanceMoved = this.calculateDistance(
        lastPosition.lat,
        lastPosition.lon,
        lat,
        lon
      );

      if (distanceMoved < this.minDistanceThresholdM) {
        // Still refresh presence TTL even if not updating position
        await this.redis.setDriverOnline(driverId);

        this.logger.debug(
          `Throttled location update for driver ${driverId}: moved only ${distanceMoved.toFixed(1)}m`
        );
        return { updated: false, reason: 'throttled', distanceMoved };
      }
    }

    // Use batched pipeline for atomic update (single round-trip)
    await this.redis.batchUpdateDriverLocation(driverId, lon, lat, ts);

    return { updated: true };
  }

  /**
   * Force update driver location (bypasses throttling)
   * Useful for initial location set or when accuracy is critical
   */
  async forceUpdateDriverLocation(update: LocationUpdate): Promise<void> {
    const { driverId, lat, lon, ts } = update;

    if (!this.isValidCoordinate(lat, lon)) {
      this.logger.warn(
        `Invalid coordinates for driver ${driverId}: ${lat}, ${lon}`
      );
      return;
    }

    await this.redis.batchUpdateDriverLocation(driverId, lon, lat, ts);
  }

  /**
   * Get nearby online drivers
   */
  async getNearbyDrivers(
    lat: number,
    lon: number,
    radiusMeters: number = 5000,
    count: number = 10
  ): Promise<GeoMember[]> {
    const candidates = await this.redis.geoSearchNearbyDrivers(
      lon,
      lat,
      radiusMeters,
      count
    );

    // Filter to only include drivers that are actually online
    const onlineDrivers: GeoMember[] = [];
    for (const candidate of candidates) {
      const isOnline = await this.redis.isDriverOnline(candidate.memberId);
      if (isOnline) {
        onlineDrivers.push(candidate);
      }
    }

    return onlineDrivers;
  }

  /**
   * Get driver's current position
   */
  async getDriverPosition(driverId: string) {
    return this.redis.geoGetDriverPosition(driverId);
  }

  /**
   * Remove driver from location tracking (cleans up all Redis keys)
   */
  async removeDriverLocation(driverId: string): Promise<void> {
    await this.redis.geoRemoveDriver(driverId);
    await this.redis.setDriverOffline(driverId);
    await this.redis.clearDriverLastPosition(driverId);
  }

  /**
   * Validate coordinates are within reasonable bounds
   * Rwanda approximate bounds: lat -1.0 to -3.0, lon 28.8 to 30.9
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    // General validation
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return false;
    }

    // Optional: Rwanda-specific validation (uncomment for strict mode)
    // if (lat < -3.0 || lat > -1.0 || lon < 28.8 || lon > 30.9) {
    //   return false;
    // }

    return true;
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const EARTH_RADIUS_M = 6371000; // Earth's radius in meters

    const toRadians = (degrees: number) => degrees * (Math.PI / 180);

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_M * c;
  }
}
