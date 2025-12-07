import { Test, TestingModule } from '@nestjs/testing';
import { RidesService } from './rides.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { TripsService } from '../trips/trips.service';
import { WsGateway } from '../../ws/ws.gateway';
import { RideRequestStatus } from '@prisma/client';

describe('RidesService', () => {
  let service: RidesService;

  const mockPrismaService = {
    rideRequest: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockMatchingService = {
    findMatches: jest.fn(),
    findMatchesWithExpansion: jest.fn(),
    getNextCandidate: jest.fn(),
  };

  const mockTripsService = {
    create: jest.fn(),
  };

  const mockWsGateway = {
    sendOfferToDriver: jest.fn(),
    sendStatusToRider: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RidesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MatchingService, useValue: mockMatchingService },
        { provide: TripsService, useValue: mockTripsService },
        { provide: WsGateway, useValue: mockWsGateway },
      ],
    }).compile();

    service = module.get<RidesService>(RidesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRideRequest', () => {
    const riderId = 'rider-123';
    const dto = {
      origin: { lat: -1.9403, lon: 29.8739 },
      destination: { lat: -1.9503, lon: 29.8839 },
    };

    it('should create a ride request and start matching', async () => {
      const rideRequest = {
        id: 'request-123',
        riderId,
        status: RideRequestStatus.PENDING,
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [],
        bestMatch: null,
      });

      const result = await service.createRideRequest(riderId, dto);

      expect(result.requestId).toBe('request-123');
      expect(mockPrismaService.rideRequest.create).toHaveBeenCalled();
      expect(mockMatchingService.findMatchesWithExpansion).toHaveBeenCalled();
    });

    it('should notify rider when no drivers found', async () => {
      const rideRequest = {
        id: 'request-456',
        riderId,
        status: RideRequestStatus.PENDING,
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [],
        bestMatch: null,
      });
      mockPrismaService.rideRequest.update.mockResolvedValue({
        ...rideRequest,
        status: RideRequestStatus.EXPIRED,
      });

      await service.createRideRequest(riderId, dto);

      expect(mockWsGateway.sendStatusToRider).toHaveBeenCalledWith(
        riderId,
        expect.objectContaining({
          status: 'no_drivers',
        })
      );
    });

    it('should send offer to best matching driver', async () => {
      const rideRequest = {
        id: 'request-789',
        riderId,
        status: RideRequestStatus.PENDING,
      };
      const bestMatch = {
        driverId: 'driver-123',
        pickupEta: { durationSec: 300, distanceM: 1000 },
        tripEta: { durationSec: 600, distanceM: 2000 },
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [bestMatch],
        bestMatch,
      });
      mockWsGateway.sendOfferToDriver.mockReturnValue(true);

      await service.createRideRequest(riderId, dto);

      expect(mockWsGateway.sendOfferToDriver).toHaveBeenCalledWith(
        'driver-123',
        expect.objectContaining({
          type: 'driver.offer',
        })
      );
    });
  });

  describe('handleDriverDecline', () => {
    it('should notify rider and try next driver when declined', async () => {
      // Setup: create a pending request first
      const riderId = 'rider-123';
      const driverId = 'driver-123';
      const requestId = 'request-123';

      const rideRequest = {
        id: requestId,
        riderId,
        status: RideRequestStatus.PENDING,
      };
      const firstDriver = {
        driverId,
        pickupEta: { durationSec: 300, distanceM: 1000 },
        tripEta: { durationSec: 600, distanceM: 2000 },
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [firstDriver],
        bestMatch: firstDriver,
      });
      mockWsGateway.sendOfferToDriver.mockReturnValue(true);

      // Create the request first
      await service.createRideRequest(riderId, {
        origin: { lat: -1.9403, lon: 29.8739 },
        destination: { lat: -1.9503, lon: 29.8839 },
      });

      jest.clearAllMocks();

      // Now handle the decline
      mockMatchingService.getNextCandidate.mockResolvedValue(null);
      mockPrismaService.rideRequest.update.mockResolvedValue({
        ...rideRequest,
        status: RideRequestStatus.EXPIRED,
      });

      await service.handleDriverDecline(requestId, driverId);

      // Should notify rider about decline
      expect(mockWsGateway.sendStatusToRider).toHaveBeenCalledWith(
        riderId,
        expect.objectContaining({
          status: 'driver_declined',
        })
      );
    });

    it('should ignore decline from wrong driver', async () => {
      const riderId = 'rider-123';
      const correctDriverId = 'driver-123';
      const wrongDriverId = 'driver-456';
      const requestId = 'request-123';

      const rideRequest = {
        id: requestId,
        riderId,
        status: RideRequestStatus.PENDING,
      };
      const driver = {
        driverId: correctDriverId,
        pickupEta: { durationSec: 300, distanceM: 1000 },
        tripEta: { durationSec: 600, distanceM: 2000 },
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [driver],
        bestMatch: driver,
      });
      mockWsGateway.sendOfferToDriver.mockReturnValue(true);

      await service.createRideRequest(riderId, {
        origin: { lat: -1.9403, lon: 29.8739 },
        destination: { lat: -1.9503, lon: 29.8839 },
      });

      jest.clearAllMocks();

      // Decline from wrong driver
      await service.handleDriverDecline(requestId, wrongDriverId);

      // Should NOT notify rider or try next driver
      expect(mockWsGateway.sendStatusToRider).not.toHaveBeenCalled();
      expect(mockMatchingService.getNextCandidate).not.toHaveBeenCalled();
    });
  });

  describe('handleDriverAccept', () => {
    it('should create trip and notify rider when accepted', async () => {
      const riderId = 'rider-123';
      const driverId = 'driver-123';
      const requestId = 'request-123';

      const rideRequest = {
        id: requestId,
        riderId,
        status: RideRequestStatus.PENDING,
      };
      const driver = {
        driverId,
        pickupEta: { durationSec: 300, distanceM: 1000 },
        tripEta: { durationSec: 600, distanceM: 2000 },
      };
      const trip = {
        id: 'trip-123',
        rideRequestId: requestId,
        driverId,
        riderId,
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [driver],
        bestMatch: driver,
      });
      mockWsGateway.sendOfferToDriver.mockReturnValue(true);

      await service.createRideRequest(riderId, {
        origin: { lat: -1.9403, lon: 29.8739 },
        destination: { lat: -1.9503, lon: 29.8839 },
      });

      jest.clearAllMocks();

      mockTripsService.create.mockResolvedValue(trip);
      mockPrismaService.rideRequest.update.mockResolvedValue({
        ...rideRequest,
        status: RideRequestStatus.MATCHED,
      });

      const result = await service.handleDriverAccept(requestId, driverId);

      expect(result).toEqual(trip);
      expect(mockTripsService.create).toHaveBeenCalled();
      expect(mockWsGateway.sendStatusToRider).toHaveBeenCalledWith(
        riderId,
        expect.objectContaining({
          status: 'matched',
          tripId: 'trip-123',
          driverId,
        })
      );
    });

    it('should return null for non-existent request', async () => {
      const result = await service.handleDriverAccept(
        'non-existent',
        'driver-123'
      );

      expect(result).toBeNull();
    });

    it('should return null if wrong driver tries to accept', async () => {
      const riderId = 'rider-123';
      const correctDriverId = 'driver-123';
      const wrongDriverId = 'driver-456';
      const requestId = 'request-123';

      const rideRequest = {
        id: requestId,
        riderId,
        status: RideRequestStatus.PENDING,
      };
      const driver = {
        driverId: correctDriverId,
        pickupEta: { durationSec: 300, distanceM: 1000 },
        tripEta: { durationSec: 600, distanceM: 2000 },
      };

      mockPrismaService.rideRequest.create.mockResolvedValue(rideRequest);
      mockMatchingService.findMatchesWithExpansion.mockResolvedValue({
        candidates: [driver],
        bestMatch: driver,
      });
      mockWsGateway.sendOfferToDriver.mockReturnValue(true);

      await service.createRideRequest(riderId, {
        origin: { lat: -1.9403, lon: 29.8739 },
        destination: { lat: -1.9503, lon: 29.8839 },
      });

      const result = await service.handleDriverAccept(requestId, wrongDriverId);

      expect(result).toBeNull();
      expect(mockTripsService.create).not.toHaveBeenCalled();
    });
  });

  describe('getUserRequests', () => {
    it('should return user ride requests', async () => {
      const userId = 'user-123';
      const requests = [
        { id: 'req-1', riderId: userId, status: RideRequestStatus.MATCHED },
        { id: 'req-2', riderId: userId, status: RideRequestStatus.PENDING },
      ];

      mockPrismaService.rideRequest.findMany.mockResolvedValue(requests);

      const result = await service.getUserRequests(userId);

      expect(result).toEqual(requests);
      expect(mockPrismaService.rideRequest.findMany).toHaveBeenCalledWith({
        where: { riderId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          trip: true,
        },
      });
    });
  });
});
