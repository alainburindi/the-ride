import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { DriverStatus, Prisma } from '@prisma/client';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
      throw new ForbiddenException('You can only update your own driver profile');
    }

    return this.prisma.driver.update({
      where: { id },
      data: {
        vehicleInfo: dto.vehicleInfo as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateStatus(id: string, userId: string, dto: UpdateDriverStatusDto) {
    // Verify ownership
    const driver = await this.prisma.driver.findUnique({
      where: { id },
    });

    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }

    if (driver.userId !== userId) {
      throw new ForbiddenException('You can only update your own driver status');
    }

    // Update database status
    const updatedDriver = await this.prisma.driver.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });

    // Update Redis presence based on status
    if (dto.status === DriverStatus.ONLINE) {
      await this.redis.setDriverOnline(id);
    } else if (dto.status === DriverStatus.OFFLINE) {
      await this.redis.setDriverOffline(id);
      await this.redis.geoRemoveDriver(id);
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
      }),
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
}

