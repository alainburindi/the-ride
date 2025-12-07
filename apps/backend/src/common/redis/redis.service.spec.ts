import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    geoadd: jest.fn(),
    zrem: jest.fn(),
    geopos: jest.fn(),
    call: jest.fn(),
    setex: jest.fn(),
    exists: jest.fn(),
    del: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    zcard: jest.fn(),
    pipeline: jest.fn().mockReturnValue({
      geoadd: jest.fn().mockReturnThis(),
      setex: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 1],
        [null, 'OK'],
        [null, 'OK'],
      ]),
    }),
  }));
});

describe('RedisService', () => {
  let service: RedisService;
  let mockRedis: any;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    mockRedis = (service as any).client;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('geoAddDriver', () => {
    it('should add driver to GEO set', async () => {
      mockRedis.geoadd.mockResolvedValue(1);

      const result = await service.geoAddDriver('driver-123', 29.8739, -1.9403);

      expect(result).toBe(1);
      expect(mockRedis.geoadd).toHaveBeenCalledWith(
        'drivers:geo',
        29.8739,
        -1.9403,
        'driver-123'
      );
    });
  });

  describe('geoRemoveDriver', () => {
    it('should remove driver from GEO set', async () => {
      mockRedis.zrem.mockResolvedValue(1);

      const result = await service.geoRemoveDriver('driver-123');

      expect(result).toBe(1);
      expect(mockRedis.zrem).toHaveBeenCalledWith('drivers:geo', 'driver-123');
    });
  });

  describe('geoGetDriverPosition', () => {
    it('should return driver position when exists', async () => {
      mockRedis.geopos.mockResolvedValue([['29.8739', '-1.9403']]);

      const result = await service.geoGetDriverPosition('driver-123');

      expect(result).toEqual({
        lon: 29.8739,
        lat: -1.9403,
      });
    });

    it('should return null when driver not in GEO set', async () => {
      mockRedis.geopos.mockResolvedValue([null]);

      const result = await service.geoGetDriverPosition('driver-123');

      expect(result).toBeNull();
    });
  });

  describe('setDriverOnline', () => {
    it('should set online presence key with TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await service.setDriverOnline('driver-123');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'driver:driver-123:online',
        120, // PRESENCE_TTL_SEC
        '1'
      );
    });
  });

  describe('isDriverOnline', () => {
    it('should return true when driver is online', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await service.isDriverOnline('driver-123');

      expect(result).toBe(true);
    });

    it('should return false when driver is offline', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.isDriverOnline('driver-123');

      expect(result).toBe(false);
    });
  });

  describe('setDriverOffline', () => {
    it('should delete online presence key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.setDriverOffline('driver-123');

      expect(mockRedis.del).toHaveBeenCalledWith('driver:driver-123:online');
    });
  });

  describe('clearDriverLastPosition', () => {
    it('should delete last position key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.clearDriverLastPosition('driver-123');

      expect(mockRedis.del).toHaveBeenCalledWith('driver:driver-123:lastpos');
    });
  });

  describe('setDriverLastPosition', () => {
    it('should store last position with TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.setDriverLastPosition(
        'driver-123',
        29.8739,
        -1.9403,
        1234567890
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'driver:driver-123:lastpos',
        JSON.stringify({ lon: 29.8739, lat: -1.9403, ts: 1234567890 }),
        'EX',
        240 // PRESENCE_TTL_SEC * 2
      );
    });
  });

  describe('getDriverLastPosition', () => {
    it('should return last position when exists', async () => {
      const positionData = { lon: 29.8739, lat: -1.9403, ts: 1234567890 };
      mockRedis.get.mockResolvedValue(JSON.stringify(positionData));

      const result = await service.getDriverLastPosition('driver-123');

      expect(result).toEqual(positionData);
    });

    it('should return null when no last position', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getDriverLastPosition('driver-123');

      expect(result).toBeNull();
    });
  });

  describe('batchUpdateDriverLocation', () => {
    it('should execute pipeline with all commands', async () => {
      const mockPipeline = {
        geoadd: jest.fn().mockReturnThis(),
        setex: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 'OK'],
          [null, 'OK'],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await service.batchUpdateDriverLocation(
        'driver-123',
        29.8739,
        -1.9403,
        1234567890
      );

      expect(mockPipeline.geoadd).toHaveBeenCalledWith(
        'drivers:geo',
        29.8739,
        -1.9403,
        'driver-123'
      );
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        'driver:driver-123:online',
        120,
        '1'
      );
      expect(mockPipeline.set).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should throw error when pipeline command fails', async () => {
      const mockPipeline = {
        geoadd: jest.fn().mockReturnThis(),
        setex: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [new Error('Redis error'), null],
          [null, 'OK'],
          [null, 'OK'],
        ]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await expect(
        service.batchUpdateDriverLocation(
          'driver-123',
          29.8739,
          -1.9403,
          1234567890
        )
      ).rejects.toThrow('Redis error');
    });
  });

  describe('geoSearchNearbyDrivers', () => {
    it('should return nearby drivers with distance and coordinates', async () => {
      mockRedis.zcard.mockResolvedValue(2);
      mockRedis.call.mockResolvedValue([
        ['driver-1', '100.5', ['29.8739', '-1.9403']],
        ['driver-2', '200.3', ['29.8740', '-1.9404']],
      ]);

      const result = await service.geoSearchNearbyDrivers(
        29.8739,
        -1.9403,
        5000,
        10
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        memberId: 'driver-1',
        distance: 100.5,
        coordinates: { lon: 29.8739, lat: -1.9403 },
      });
    });

    it('should return empty array when no drivers found', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.call.mockResolvedValue([]);

      const result = await service.geoSearchNearbyDrivers(
        29.8739,
        -1.9403,
        5000,
        10
      );

      expect(result).toHaveLength(0);
    });
  });
});
