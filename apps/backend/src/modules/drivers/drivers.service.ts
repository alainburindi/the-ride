import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { DriverStatus, DriverApprovalStatus, Prisma } from '@prisma/client';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { ApproveDriverDto } from './dto/approve-driver.dto';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async findAll() {
    return this.prisma.driver.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    // Get online status from Redis
    const isOnline = await this.redis.isDriverOnline(id);
    const lastPosition = await this.redis.getDriverLastPosition(id);

    return {
      ...driver,
      isOnline,
      lastPosition,
    };
  }

  async findByUserId(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException(`Driver for user ${userId} not found`);
    }

    return driver;
  }

  async update(id: string, userId: string, dto: UpdateDriverDto) {
    // Verify ownership
    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    if (driver.userId !== userId) {
      throw new ForbiddenException(
        'You can only update your own driver profile'
      );
    }

    return this.prisma.driver.update({
      where: { id },
      data: {
        vehicleInfo: dto.vehicleInfo as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateStatusByUserId(userId: string, dto: UpdateDriverStatusDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException(`Driver for user ${userId} not found`);
    }

    return this.updateDriverStatus(driver.id, dto);
  }

  async updateStatusById(driverId: string, dto: UpdateDriverStatusDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${driverId} not found`);
    }

    return this.updateDriverStatus(driverId, dto);
  }

  private async updateDriverStatus(
    driverId: string,
    dto: UpdateDriverStatusDto
  ) {
    // Update database status
    const updatedDriver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        status: dto.status,
      },
    });

    // Update Redis presence based on status
    if (dto.status === DriverStatus.ONLINE) {
      await this.redis.setDriverOnline(driverId);
    } else if (dto.status === DriverStatus.OFFLINE) {
      await this.redis.setDriverOffline(driverId);
      await this.redis.geoRemoveDriver(driverId);
    }
    // BUSY status keeps online presence but doesn't remove from geo

    return updatedDriver;
  }

  async getOnlineDrivers() {
    // Get all drivers from the geo set
    // This is a simplified approach - in production you might want pagination
    const drivers = await this.prisma.driver.findMany({
      where: {
        status: {
          in: [DriverStatus.ONLINE, DriverStatus.BUSY],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Enrich with Redis data
    const enrichedDrivers = await Promise.all(
      drivers.map(async (driver) => {
        const isOnline = await this.redis.isDriverOnline(driver.id);
        const lastPosition = await this.redis.getDriverLastPosition(driver.id);
        return {
          ...driver,
          isOnline,
          lastPosition,
        };
      })
    );

    return enrichedDrivers.filter((d) => d.isOnline);
  }

  async setDriverBusy(driverId: string) {
    return this.prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.BUSY },
    });
  }

  async setDriverOnline(driverId: string) {
    return this.prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.ONLINE },
    });
  }

  // ==================== Admin Operations ====================

  /**
   * Get all drivers pending approval (Admin only)
   */
  async findPendingApproval() {
    return this.prisma.driver.findMany({
      where: {
        approvalStatus: DriverApprovalStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Get drivers by approval status (Admin only)
   */
  async findByApprovalStatus(status: DriverApprovalStatus) {
    return this.prisma.driver.findMany({
      where: {
        approvalStatus: status,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * Approve or reject a driver (Admin only)
   */
  async updateApprovalStatus(
    driverId: string,
    adminUserId: string,
    dto: ApproveDriverDto
  ) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${driverId} not found`);
    }

    if (driver.approvalStatus !== DriverApprovalStatus.PENDING) {
      throw new BadRequestException(
        `Driver is already ${driver.approvalStatus.toLowerCase()}`
      );
    }

    if (dto.status === DriverApprovalStatus.REJECTED && !dto.rejectionNote) {
      throw new BadRequestException(
        'Rejection note is required when rejecting a driver'
      );
    }

    return this.prisma.driver.update({
      where: { id: driverId },
      data: {
        approvalStatus: dto.status,
        approvedBy: adminUserId,
        approvedAt: new Date(),
        rejectionNote:
          dto.status === DriverApprovalStatus.REJECTED
            ? dto.rejectionNote
            : null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Get driver approval statistics (Admin only)
   */
  async getApprovalStats() {
    const [pending, approved, rejected, total] = await Promise.all([
      this.prisma.driver.count({
        where: { approvalStatus: DriverApprovalStatus.PENDING },
      }),
      this.prisma.driver.count({
        where: { approvalStatus: DriverApprovalStatus.APPROVED },
      }),
      this.prisma.driver.count({
        where: { approvalStatus: DriverApprovalStatus.REJECTED },
      }),
      this.prisma.driver.count(),
    ]);

    return { pending, approved, rejected, total };
  }
}
