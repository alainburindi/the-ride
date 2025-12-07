import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LocationsService } from './locations.service';
import { RedisService } from '../../common/redis/redis.service';

describe('LocationsService', () => {
  let service: LocationsService;
  let redisService: jest.Mocked<RedisService>;

  const mockRedisService = {
    getDriverLastPosition: jest.fn(),
    setDriverOnline: jest.fn(),
    batchUpdateDriverLocation: jest.fn(),
    geoSearchNearbyDrivers: jest.fn(),
    isDriverOnline: jest.fn(),
    geoGetDriverPosition: jest.fn(),
    geoRemoveDriver: jest.fn(),
    setDriverOffline: jest.fn(),
    clearDriverLastPosition: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(10), // 10 meters threshold
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    redisService = module.get(RedisService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateDriverLocation', () => {
    const driverId = 'driver-123';
    const update = {
      driverId,
      lat: -1.9403,
      lon: 29.8739,
      ts: Date.now(),
    };

    it('should update location when driver has no previous position', async () => {
      mockRedisService.getDriverLastPosition.mockResolvedValue(null);
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      const result = await service.updateDriverLocation(update);

      expect(result.updated).toBe(true);
      expect(mockRedisService.batchUpdateDriverLocation).toHaveBeenCalledWith(
        driverId,
        update.lon,
        update.lat,
        update.ts
      );
    });

    it('should throttle when driver is in GEO set and moved less than threshold', async () => {
      // Driver is already in GEO set
      mockRedisService.geoGetDriverPosition.mockResolvedValue({
        lon: 29.8739,
        lat: -1.9403,
      });
      // Previous position very close to new position (< 10m)
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.9403,
        lon: 29.8739,
        ts: Date.now() - 1000,
      });

      const result = await service.updateDriverLocation({
        ...update,
        lat: -1.94031, // Moved ~1 meter
        lon: 29.87391,
      });

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('throttled');
      expect(mockRedisService.batchUpdateDriverLocation).not.toHaveBeenCalled();
      // Should still refresh presence
      expect(mockRedisService.setDriverOnline).toHaveBeenCalledWith(driverId);
    });

    it('should NOT throttle when driver is not in GEO set even if lastpos exists', async () => {
      // Driver is NOT in GEO set
      mockRedisService.geoGetDriverPosition.mockResolvedValue(null);
      // Previous position exists (from old session)
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.9403,
        lon: 29.8739,
        ts: Date.now() - 1000,
      });
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      const result = await service.updateDriverLocation({
        ...update,
        lat: -1.94031, // Would be throttled if in GEO set
        lon: 29.87391,
      });

      // Should NOT throttle - driver needs to be added to GEO set
      expect(result.updated).toBe(true);
      expect(mockRedisService.batchUpdateDriverLocation).toHaveBeenCalled();
    });

    it('should update when driver moved more than threshold', async () => {
      // Driver is in GEO set
      mockRedisService.geoGetDriverPosition.mockResolvedValue({
        lon: 29.8739,
        lat: -1.9413,
      });
      // Previous position ~100m away
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.9413, // ~100m south
        lon: 29.8739,
        ts: Date.now() - 5000,
      });
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      const result = await service.updateDriverLocation(update);

      expect(result.updated).toBe(true);
      expect(mockRedisService.batchUpdateDriverLocation).toHaveBeenCalled();
    });

    it('should reject invalid coordinates', async () => {
      const invalidUpdate = {
        driverId,
        lat: 999, // Invalid latitude
        lon: 29.8739,
        ts: Date.now(),
      };

      const result = await service.updateDriverLocation(invalidUpdate);

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('invalid_coordinates');
    });
  });

  describe('getNearbyDrivers', () => {
    it('should return only online drivers', async () => {
      const mockCandidates = [
        {
          memberId: 'driver-1',
          distance: 100,
          coordinates: { lat: -1.94, lon: 29.87 },
        },
        {
          memberId: 'driver-2',
          distance: 200,
          coordinates: { lat: -1.95, lon: 29.88 },
        },
      ];

      mockRedisService.geoSearchNearbyDrivers.mockResolvedValue(mockCandidates);
      mockRedisService.isDriverOnline
        .mockResolvedValueOnce(true) // driver-1 online
        .mockResolvedValueOnce(false); // driver-2 offline

      const result = await service.getNearbyDrivers(-1.94, 29.87, 5000, 10);

      expect(result).toHaveLength(1);
      expect(result[0].memberId).toBe('driver-1');
    });

    it('should return empty array when no drivers nearby', async () => {
      mockRedisService.geoSearchNearbyDrivers.mockResolvedValue([]);

      const result = await service.getNearbyDrivers(-1.94, 29.87, 5000, 10);

      expect(result).toHaveLength(0);
    });
  });

  describe('calculateDistance (via throttling)', () => {
    it('should correctly calculate distance between two points', async () => {
      // Kigali city center to ~111m north
      // 1 degree of latitude ≈ 111km, so 0.001 degree ≈ 111m
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.9403,
        lon: 29.8739,
        ts: Date.now() - 1000,
      });
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      const result = await service.updateDriverLocation({
        driverId: 'driver-123',
        lat: -1.9393, // ~111m north
        lon: 29.8739,
        ts: Date.now(),
      });

      // Should update since moved > 10m
      expect(result.updated).toBe(true);
    });
  });

  describe('removeDriverLocation', () => {
    const driverId = 'driver-123';

    it('should remove driver from GEO set and clear all keys', async () => {
      mockRedisService.geoRemoveDriver.mockResolvedValue(1);
      mockRedisService.setDriverOffline.mockResolvedValue(undefined);
      mockRedisService.clearDriverLastPosition.mockResolvedValue(undefined);

      await service.removeDriverLocation(driverId);

      expect(mockRedisService.geoRemoveDriver).toHaveBeenCalledWith(driverId);
      expect(mockRedisService.setDriverOffline).toHaveBeenCalledWith(driverId);
      expect(mockRedisService.clearDriverLastPosition).toHaveBeenCalledWith(
        driverId
      );
    });
  });

  describe('forceUpdateDriverLocation', () => {
    const driverId = 'driver-123';
    const update = {
      driverId,
      lat: -1.9403,
      lon: 29.8739,
      ts: Date.now(),
    };

    it('should bypass throttling and always update', async () => {
      // Even with existing position nearby
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.9403,
        lon: 29.8739,
        ts: Date.now() - 1000,
      });
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      await service.forceUpdateDriverLocation(update);

      // Should always call batch update regardless of distance
      expect(mockRedisService.batchUpdateDriverLocation).toHaveBeenCalledWith(
        driverId,
        update.lon,
        update.lat,
        update.ts
      );
    });
  });

  describe('edge cases', () => {
    const driverId = 'driver-123';

    it('should handle longitude edge case (0 distance)', async () => {
      mockRedisService.geoGetDriverPosition.mockResolvedValue({
        lon: 29.8739,
        lat: -1.9403,
      });
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.9403,
        lon: 29.8739,
        ts: Date.now() - 1000,
      });

      const result = await service.updateDriverLocation({
        driverId,
        lat: -1.9403,
        lon: 29.8739, // Exact same position
        ts: Date.now(),
      });

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('throttled');
    });

    it('should handle negative latitude (southern hemisphere)', async () => {
      mockRedisService.geoGetDriverPosition.mockResolvedValue(null);
      mockRedisService.getDriverLastPosition.mockResolvedValue(null);
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      const result = await service.updateDriverLocation({
        driverId,
        lat: -1.9403, // Rwanda is in southern hemisphere
        lon: 29.8739,
        ts: Date.now(),
      });

      expect(result.updated).toBe(true);
    });

    it('should reject latitude out of bounds', async () => {
      const result = await service.updateDriverLocation({
        driverId,
        lat: -91, // Invalid - must be -90 to 90
        lon: 29.8739,
        ts: Date.now(),
      });

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('invalid_coordinates');
    });

    it('should reject longitude out of bounds', async () => {
      const result = await service.updateDriverLocation({
        driverId,
        lat: -1.9403,
        lon: 181, // Invalid - must be -180 to 180
        ts: Date.now(),
      });

      expect(result.updated).toBe(false);
      expect(result.reason).toBe('invalid_coordinates');
    });

    it('should handle first location update for new driver', async () => {
      // No GEO position, no last position
      mockRedisService.geoGetDriverPosition.mockResolvedValue(null);
      mockRedisService.getDriverLastPosition.mockResolvedValue(null);
      mockRedisService.batchUpdateDriverLocation.mockResolvedValue(undefined);

      const result = await service.updateDriverLocation({
        driverId,
        lat: -1.9403,
        lon: 29.8739,
        ts: Date.now(),
      });

      expect(result.updated).toBe(true);
      expect(mockRedisService.batchUpdateDriverLocation).toHaveBeenCalled();
    });
  });
});
