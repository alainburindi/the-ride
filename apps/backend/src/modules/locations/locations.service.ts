import { Injectable, Logger } from '@nestjs/common';
import { RedisService, GeoMember } from '../../common/redis/redis.service';

export interface LocationUpdate {
  driverId: string;
  lat: number;
  lon: number;
  ts: number;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Update driver location in Redis GEO set and refresh presence
   */
  async updateDriverLocation(update: LocationUpdate): Promise<void> {
    const { driverId, lat, lon, ts } = update;

    // Validate coordinates (Rwanda approximate bounds)
    if (!this.isValidCoordinate(lat, lon)) {
      this.logger.warn(
        `Invalid coordinates for driver ${driverId}: ${lat}, ${lon}`,
      );
      return;
    }

    // Update GEO position
    await this.redis.geoAddDriver(driverId, lon, lat);

    // Refresh online presence TTL
    await this.redis.setDriverOnline(driverId);

    // Store last known position with timestamp
    await this.redis.setDriverLastPosition(driverId, lon, lat, ts);

    this.logger.debug(
      `Updated location for driver ${driverId}: ${lat}, ${lon}`,
    );
  }

  /**
   * Get nearby online drivers
   */
  async getNearbyDrivers(
    lat: number,
    lon: number,
    radiusMeters: number = 5000,
    count: number = 10,
  ): Promise<GeoMember[]> {
    const candidates = await this.redis.geoSearchNearbyDrivers(
      lon,
      lat,
      radiusMeters,
      count,
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
   * Remove driver from location tracking
   */
  async removeDriverLocation(driverId: string): Promise<void> {
    await this.redis.geoRemoveDriver(driverId);
    await this.redis.setDriverOffline(driverId);
    this.logger.debug(`Removed location tracking for driver ${driverId}`);
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
}

