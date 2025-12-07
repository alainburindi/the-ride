import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { DriverStatus, DriverApprovalStatus } from '@prisma/client';

describe('DriversService', () => {
  let service: DriversService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;

  const mockPrismaService = {
    driver: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockRedisService = {
    isDriverOnline: jest.fn(),
    getDriverLastPosition: jest.fn(),
    setDriverOnline: jest.fn(),
    setDriverOffline: jest.fn(),
    geoRemoveDriver: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return driver with online status', async () => {
      const mockDriver = {
        id: 'driver-123',
        userId: 'user-123',
        status: DriverStatus.ONLINE,
        user: { id: 'user-123', email: 'driver@test.com' },
      };

      mockPrismaService.driver.findUnique.mockResolvedValue(mockDriver);
      mockRedisService.isDriverOnline.mockResolvedValue(true);
      mockRedisService.getDriverLastPosition.mockResolvedValue({
        lat: -1.94,
        lon: 29.87,
        ts: Date.now(),
      });

      const result = await service.findOne('driver-123');

      expect(result.id).toBe('driver-123');
      expect(result.isOnline).toBe(true);
      expect(result.lastPosition).toBeDefined();
    });

    it('should throw NotFoundException for non-existent driver', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateStatusById', () => {
    const driverId = 'driver-123';

    it('should update driver status to ONLINE', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        id: driverId,
      });
      mockPrismaService.driver.update.mockResolvedValue({
        id: driverId,
        status: DriverStatus.ONLINE,
      });

      await service.updateStatusById(driverId, {
        status: DriverStatus.ONLINE,
      });

      expect(mockRedisService.setDriverOnline).toHaveBeenCalledWith(driverId);
    });

    it('should update driver status to OFFLINE and remove from geo', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        id: driverId,
      });
      mockPrismaService.driver.update.mockResolvedValue({
        id: driverId,
        status: DriverStatus.OFFLINE,
      });

      await service.updateStatusById(driverId, {
        status: DriverStatus.OFFLINE,
      });

      expect(mockRedisService.setDriverOffline).toHaveBeenCalledWith(driverId);
      expect(mockRedisService.geoRemoveDriver).toHaveBeenCalledWith(driverId);
    });

    it('should throw NotFoundException for non-existent driver', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatusById('non-existent', { status: DriverStatus.ONLINE })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Admin Operations', () => {
    describe('findPendingApproval', () => {
      it('should return pending drivers ordered by creation date', async () => {
        const pendingDrivers = [
          { id: 'driver-1', approvalStatus: DriverApprovalStatus.PENDING },
          { id: 'driver-2', approvalStatus: DriverApprovalStatus.PENDING },
        ];

        mockPrismaService.driver.findMany.mockResolvedValue(pendingDrivers);

        const result = await service.findPendingApproval();

        expect(mockPrismaService.driver.findMany).toHaveBeenCalledWith({
          where: { approvalStatus: DriverApprovalStatus.PENDING },
          include: expect.any(Object),
          orderBy: { createdAt: 'asc' },
        });
        expect(result).toHaveLength(2);
      });
    });

    describe('updateApprovalStatus', () => {
      const driverId = 'driver-123';
      const adminUserId = 'admin-123';

      it('should approve a pending driver', async () => {
        mockPrismaService.driver.findUnique.mockResolvedValue({
          id: driverId,
          approvalStatus: DriverApprovalStatus.PENDING,
        });
        mockPrismaService.driver.update.mockResolvedValue({
          id: driverId,
          approvalStatus: DriverApprovalStatus.APPROVED,
          approvedBy: adminUserId,
        });

        const result = await service.updateApprovalStatus(
          driverId,
          adminUserId,
          {
            status: DriverApprovalStatus.APPROVED,
          }
        );

        expect(mockPrismaService.driver.update).toHaveBeenCalledWith({
          where: { id: driverId },
          data: expect.objectContaining({
            approvalStatus: DriverApprovalStatus.APPROVED,
            approvedBy: adminUserId,
            approvedAt: expect.any(Date),
            rejectionNote: null,
          }),
          include: expect.any(Object),
        });
      });

      it('should reject a driver with rejection note', async () => {
        mockPrismaService.driver.findUnique.mockResolvedValue({
          id: driverId,
          approvalStatus: DriverApprovalStatus.PENDING,
        });
        mockPrismaService.driver.update.mockResolvedValue({
          id: driverId,
          approvalStatus: DriverApprovalStatus.REJECTED,
          rejectionNote: 'Invalid documents',
        });

        await service.updateApprovalStatus(driverId, adminUserId, {
          status: DriverApprovalStatus.REJECTED,
          rejectionNote: 'Invalid documents',
        });

        expect(mockPrismaService.driver.update).toHaveBeenCalledWith({
          where: { id: driverId },
          data: expect.objectContaining({
            approvalStatus: DriverApprovalStatus.REJECTED,
            rejectionNote: 'Invalid documents',
          }),
          include: expect.any(Object),
        });
      });

      it('should throw BadRequestException when rejecting without note', async () => {
        mockPrismaService.driver.findUnique.mockResolvedValue({
          id: driverId,
          approvalStatus: DriverApprovalStatus.PENDING,
        });

        await expect(
          service.updateApprovalStatus(driverId, adminUserId, {
            status: DriverApprovalStatus.REJECTED,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw BadRequestException for already processed driver', async () => {
        mockPrismaService.driver.findUnique.mockResolvedValue({
          id: driverId,
          approvalStatus: DriverApprovalStatus.APPROVED,
        });

        await expect(
          service.updateApprovalStatus(driverId, adminUserId, {
            status: DriverApprovalStatus.APPROVED,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw NotFoundException for non-existent driver', async () => {
        mockPrismaService.driver.findUnique.mockResolvedValue(null);

        await expect(
          service.updateApprovalStatus(driverId, adminUserId, {
            status: DriverApprovalStatus.APPROVED,
          })
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('getApprovalStats', () => {
      it('should return approval statistics', async () => {
        mockPrismaService.driver.count
          .mockResolvedValueOnce(5) // pending
          .mockResolvedValueOnce(20) // approved
          .mockResolvedValueOnce(3) // rejected
          .mockResolvedValueOnce(28); // total

        const result = await service.getApprovalStats();

        expect(result).toEqual({
          pending: 5,
          approved: 20,
          rejected: 3,
          total: 28,
        });
      });
    });
  });
});
