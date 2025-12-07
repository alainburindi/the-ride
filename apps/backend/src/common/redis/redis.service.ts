import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface GeoPosition {
  lon: number;
  lat: number;
}

export interface GeoMember {
  memberId: string;
  distance: number; // meters
  coordinates: GeoPosition;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  // Redis key constants
  static readonly DRIVERS_GEO_KEY = 'drivers:geo';
  static readonly DRIVER_ONLINE_PREFIX = 'driver:';
  static readonly DRIVER_ONLINE_SUFFIX = ':online';
  static readonly DRIVER_LASTPOS_SUFFIX = ':lastpos';
  static readonly PRESENCE_TTL_SEC = 120;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.client = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  // ==================== GEO Operations ====================

  /**
   * Add or update a driver's position in the GEO set
   */
  async geoAddDriver(
    driverId: string,
    lon: number,
    lat: number,
  ): Promise<number> {
    return this.client.geoadd(RedisService.DRIVERS_GEO_KEY, lon, lat, driverId);
  }

  /**
   * Remove a driver from the GEO set
   */
  async geoRemoveDriver(driverId: string): Promise<number> {
    return this.client.zrem(RedisService.DRIVERS_GEO_KEY, driverId);
  }

  /**
   * Get a driver's position from the GEO set
   */
  async geoGetDriverPosition(driverId: string): Promise<GeoPosition | null> {
    const positions = await this.client.geopos(
      RedisService.DRIVERS_GEO_KEY,
      driverId,
    );
    if (positions && positions[0]) {
      const [lon, lat] = positions[0];
      return {
        lon: parseFloat(lon as string),
        lat: parseFloat(lat as string),
      };
    }
    return null;
  }

  /**
   * Search for nearby drivers within a radius (meters)
   * Returns drivers sorted by distance ascending
   */
  async geoSearchNearbyDrivers(
    lon: number,
    lat: number,
    radiusMeters: number,
    count: number = 10,
  ): Promise<GeoMember[]> {
    // Using GEOSEARCH with FROMLONLAT, BYRADIUS, ASC, COUNT, WITHDIST, WITHCOORD
    const results = await this.client.call(
      'GEOSEARCH',
      RedisService.DRIVERS_GEO_KEY,
      'FROMLONLAT',
      lon.toString(),
      lat.toString(),
      'BYRADIUS',
      radiusMeters.toString(),
      'm',
      'ASC',
      'COUNT',
      count.toString(),
      'WITHDIST',
      'WITHCOORD',
    );

    if (!results || !Array.isArray(results)) {
      return [];
    }

    return (results as unknown[][]).map((item) => {
      const [memberId, distance, coords] = item as [
        string,
        string,
        [string, string],
      ];
      return {
        memberId,
        distance: parseFloat(distance),
        coordinates: {
          lon: parseFloat(coords[0]),
          lat: parseFloat(coords[1]),
        },
      };
    });
  }

  // ==================== Presence Operations ====================

  /**
   * Set driver online presence with TTL
   */
  async setDriverOnline(driverId: string): Promise<void> {
    const key = `${RedisService.DRIVER_ONLINE_PREFIX}${driverId}${RedisService.DRIVER_ONLINE_SUFFIX}`;
    await this.client.setex(key, RedisService.PRESENCE_TTL_SEC, '1');
  }

  /**
   * Check if driver is online (presence key exists)
   */
  async isDriverOnline(driverId: string): Promise<boolean> {
    const key = `${RedisService.DRIVER_ONLINE_PREFIX}${driverId}${RedisService.DRIVER_ONLINE_SUFFIX}`;
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  /**
   * Set driver offline (remove presence key)
   */
  async setDriverOffline(driverId: string): Promise<void> {
    const key = `${RedisService.DRIVER_ONLINE_PREFIX}${driverId}${RedisService.DRIVER_ONLINE_SUFFIX}`;
    await this.client.del(key);
  }

  /**
   * Store last known position for a driver
   */
  async setDriverLastPosition(
    driverId: string,
    lon: number,
    lat: number,
    timestamp: number,
  ): Promise<void> {
    const key = `${RedisService.DRIVER_ONLINE_PREFIX}${driverId}${RedisService.DRIVER_LASTPOS_SUFFIX}`;
    await this.client.set(
      key,
      JSON.stringify({ lon, lat, ts: timestamp }),
      'EX',
      RedisService.PRESENCE_TTL_SEC * 2, // Keep last position a bit longer
    );
  }

  /**
   * Get last known position for a driver
   */
  async getDriverLastPosition(
    driverId: string,
  ): Promise<{ lon: number; lat: number; ts: number } | null> {
    const key = `${RedisService.DRIVER_ONLINE_PREFIX}${driverId}${RedisService.DRIVER_LASTPOS_SUFFIX}`;
    const data = await this.client.get(key);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  }

  // ==================== Generic Operations ====================

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }
}

