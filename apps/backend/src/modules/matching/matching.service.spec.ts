import { Test, TestingModule } from '@nestjs/testing';
import { MatchingService } from './matching.service';
import { LocationsService } from '../locations/locations.service';
import { OsrmService } from '../../common/osrm/osrm.service';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DriverStatus, DriverApprovalStatus } from '@prisma/client';

describe('MatchingService', () => {
  let service: MatchingService;
  let locationsService: jest.Mocked<LocationsService>;
  let osrmService: jest.Mocked<OsrmService>;
  let prismaService: jest.Mocked<PrismaService>;

  const mockLocationsService = {
    getNearbyDrivers: jest.fn(),
  };

  const mockOsrmService = {
    getFullRouteEta: jest.fn(),
  };

  const mockRedisService = {};

  const mockPrismaService = {
    driver: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: LocationsService, useValue: mockLocationsService },
        { provide: OsrmService, useValue: mockOsrmService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
    locationsService = module.get(LocationsService);
    osrmService = module.get(OsrmService);
    prismaService = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findMatches', () => {
    const matchRequest = {
      origin: { lat: -1.9403, lon: 29.8739 },
      destination: { lat: -1.9503, lon: 29.8839 },
    };

    it('should return empty result when no nearby drivers', async () => {
      mockLocationsService.getNearbyDrivers.mockResolvedValue([]);

      const result = await service.findMatches(matchRequest);

      expect(result.candidates).toHaveLength(0);
      expect(result.bestMatch).toBeNull();
    });

    it('should filter to only online and approved drivers', async () => {
      const nearbyDrivers = [
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
        {
          memberId: 'driver-3',
          distance: 300,
          coordinates: { lat: -1.96, lon: 29.89 },
        },
      ];

      mockLocationsService.getNearbyDrivers.mockResolvedValue(nearbyDrivers);

      // Only driver-1 is ONLINE and APPROVED
      mockPrismaService.driver.findMany.mockResolvedValue([{ id: 'driver-1' }]);

      mockOsrmService.getFullRouteEta.mockResolvedValue({
        pickup: { durationSec: 300, distanceMeters: 1000 },
        trip: { durationSec: 600, distanceMeters: 2000 },
      });

      const result = await service.findMatches(matchRequest);

      expect(mockPrismaService.driver.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['driver-1', 'driver-2', 'driver-3'] },
          status: DriverStatus.ONLINE,
          approvalStatus: DriverApprovalStatus.APPROVED,
        },
        select: { id: true },
      });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].driverId).toBe('driver-1');
    });

    it('should calculate score based on pickup and trip ETA', async () => {
      const nearbyDrivers = [
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

      mockLocationsService.getNearbyDrivers.mockResolvedValue(nearbyDrivers);
      mockPrismaService.driver.findMany.mockResolvedValue([
        { id: 'driver-1' },
        { id: 'driver-2' },
      ]);

      // Driver 2 has faster pickup but slower trip
      mockOsrmService.getFullRouteEta
        .mockResolvedValueOnce({
          pickup: { durationSec: 300, distanceMeters: 1000 },
          trip: { durationSec: 600, distanceMeters: 2000 },
        })
        .mockResolvedValueOnce({
          pickup: { durationSec: 200, distanceMeters: 800 },
          trip: { durationSec: 800, distanceMeters: 2500 },
        });

      const result = await service.findMatches(matchRequest);

      expect(result.candidates).toHaveLength(2);
      // Best match should be based on weighted score (pickup * 0.7 + trip * 0.3)
      // Driver 1: 300 * 0.7 + 600 * 0.3 = 210 + 180 = 390
      // Driver 2: 200 * 0.7 + 800 * 0.3 = 140 + 240 = 380
      // Driver 2 should be best match
      expect(result.bestMatch?.driverId).toBe('driver-2');
    });

    it('should return empty when all drivers are busy or unapproved', async () => {
      const nearbyDrivers = [
        {
          memberId: 'driver-1',
          distance: 100,
          coordinates: { lat: -1.94, lon: 29.87 },
        },
      ];

      mockLocationsService.getNearbyDrivers.mockResolvedValue(nearbyDrivers);
      mockPrismaService.driver.findMany.mockResolvedValue([]); // No available drivers

      const result = await service.findMatches(matchRequest);

      expect(result.candidates).toHaveLength(0);
      expect(result.bestMatch).toBeNull();
    });
  });

  describe('findMatchesWithExpansion', () => {
    const matchRequest = {
      origin: { lat: -1.9403, lon: 29.8739 },
      destination: { lat: -1.9503, lon: 29.8839 },
    };

    it('should expand radius when no matches found initially', async () => {
      mockLocationsService.getNearbyDrivers
        .mockResolvedValueOnce([]) // First call with 5km radius
        .mockResolvedValueOnce([
          // Second call with 10km radius
          {
            memberId: 'driver-1',
            distance: 7000,
            coordinates: { lat: -1.94, lon: 29.87 },
          },
        ]);

      mockPrismaService.driver.findMany.mockResolvedValue([{ id: 'driver-1' }]);
      mockOsrmService.getFullRouteEta.mockResolvedValue({
        pickup: { durationSec: 600, distanceMeters: 7000 },
        trip: { durationSec: 600, distanceMeters: 2000 },
      });

      const result = await service.findMatchesWithExpansion(matchRequest);

      expect(mockLocationsService.getNearbyDrivers).toHaveBeenCalledTimes(2);
      expect(result.candidates).toHaveLength(1);
    });
  });

  describe('getNextCandidate', () => {
    it('should exclude previously declined drivers', async () => {
      const nearbyDrivers = [
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

      mockLocationsService.getNearbyDrivers.mockResolvedValue(nearbyDrivers);
      mockPrismaService.driver.findMany.mockResolvedValue([
        { id: 'driver-1' },
        { id: 'driver-2' },
      ]);

      mockOsrmService.getFullRouteEta.mockResolvedValue({
        pickup: { durationSec: 300, distanceMeters: 1000 },
        trip: { durationSec: 600, distanceMeters: 2000 },
      });

      const matchRequest = {
        origin: { lat: -1.9403, lon: 29.8739 },
        destination: { lat: -1.9503, lon: 29.8839 },
      };

      const result = await service.getNextCandidate(matchRequest, ['driver-1']);

      expect(result?.driverId).toBe('driver-2');
    });

    it('should return null when all drivers declined', async () => {
      const nearbyDrivers = [
        {
          memberId: 'driver-1',
          distance: 100,
          coordinates: { lat: -1.94, lon: 29.87 },
        },
      ];

      mockLocationsService.getNearbyDrivers.mockResolvedValue(nearbyDrivers);
      mockPrismaService.driver.findMany.mockResolvedValue([{ id: 'driver-1' }]);

      mockOsrmService.getFullRouteEta.mockResolvedValue({
        pickup: { durationSec: 300, distanceMeters: 1000 },
        trip: { durationSec: 600, distanceMeters: 2000 },
      });

      const matchRequest = {
        origin: { lat: -1.9403, lon: 29.8739 },
        destination: { lat: -1.9503, lon: 29.8839 },
      };

      const result = await service.getNextCandidate(matchRequest, ['driver-1']);

      expect(result).toBeNull();
    });
  });
});
