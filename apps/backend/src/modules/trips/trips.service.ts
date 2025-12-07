import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { TripState, DriverStatus } from '@prisma/client';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripStateDto } from './dto/update-trip-state.dto';

// Valid state transitions
const STATE_TRANSITIONS: Record<TripState, TripState[]> = {
  [TripState.MATCHING]: [TripState.ASSIGNED, TripState.CANCELED],
  [TripState.ASSIGNED]: [TripState.EN_ROUTE, TripState.CANCELED],
  [TripState.EN_ROUTE]: [TripState.ARRIVED, TripState.CANCELED],
  [TripState.ARRIVED]: [TripState.IN_PROGRESS, TripState.CANCELED],
  [TripState.IN_PROGRESS]: [TripState.COMPLETED, TripState.CANCELED],
  [TripState.COMPLETED]: [],
  [TripState.CANCELED]: [],
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DriversService,
  ) {}

  async create(dto: CreateTripDto) {
    // Set driver to BUSY
    await this.driversService.setDriverBusy(dto.driverId);

    // Update ride request status
    await this.prisma.rideRequest.update({
      where: { id: dto.rideRequestId },
      data: { status: 'MATCHED' },
    });

    return this.prisma.trip.create({
      data: {
        rideRequestId: dto.rideRequestId,
        riderId: dto.riderId,
        driverId: dto.driverId,
        originLat: dto.origin.lat,
        originLon: dto.origin.lon,
        destinationLat: dto.destination.lat,
        destinationLon: dto.destination.lon,
        state: TripState.ASSIGNED,
        pickupEtaSec: dto.pickupEtaSec,
        tripEtaSec: dto.tripEtaSec,
        distanceMeters: dto.distanceMeters,
      },
      include: {
        rider: {
          select: { id: true, email: true },
        },
        driver: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
      },
    });
  }

  async findAll(userId: string, role: string) {
    // Riders see their trips, drivers see their assigned trips
    if (role === 'RIDER') {
      return this.prisma.trip.findMany({
        where: { riderId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          driver: {
            include: {
              user: { select: { id: true, email: true } },
            },
          },
        },
      });
    } else if (role === 'DRIVER') {
      const driver = await this.driversService.findByUserId(userId);
      return this.prisma.trip.findMany({
        where: { driverId: driver.id },
        orderBy: { createdAt: 'desc' },
        include: {
          rider: { select: { id: true, email: true } },
        },
      });
    }

    return [];
  }

  async findOne(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        rider: { select: { id: true, email: true } },
        driver: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
        rideRequest: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${id} not found`);
    }

    return trip;
  }

  async updateState(
    id: string,
    userId: string,
    role: string,
    dto: UpdateTripStateDto,
  ) {
    const trip = await this.findOne(id);

    // Verify user is part of this trip
    if (role === 'RIDER' && trip.riderId !== userId) {
      throw new ForbiddenException('You are not the rider of this trip');
    }

    if (role === 'DRIVER') {
      const driver = await this.driversService.findByUserId(userId);
      if (trip.driverId !== driver.id) {
        throw new ForbiddenException('You are not the driver of this trip');
      }
    }

    // Validate state transition
    const allowedTransitions = STATE_TRANSITIONS[trip.state];
    if (!allowedTransitions.includes(dto.state)) {
      throw new BadRequestException(
        `Cannot transition from ${trip.state} to ${dto.state}`,
      );
    }

    // Update trip state
    const updateData: { state: TripState; completedAt?: Date } = {
      state: dto.state,
    };

    if (dto.state === TripState.COMPLETED) {
      updateData.completedAt = new Date();
      // Set driver back to ONLINE
      await this.driversService.setDriverOnline(trip.driverId);
    }

    if (dto.state === TripState.CANCELED) {
      // Set driver back to ONLINE
      await this.driversService.setDriverOnline(trip.driverId);
    }

    return this.prisma.trip.update({
      where: { id },
      data: updateData,
      include: {
        rider: { select: { id: true, email: true } },
        driver: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
      },
    });
  }

  async getActiveTrip(userId: string, role: string) {
    const activeStates = [
      TripState.ASSIGNED,
      TripState.EN_ROUTE,
      TripState.ARRIVED,
      TripState.IN_PROGRESS,
    ];

    if (role === 'RIDER') {
      return this.prisma.trip.findFirst({
        where: {
          riderId: userId,
          state: { in: activeStates },
        },
        include: {
          driver: {
            include: {
              user: { select: { id: true, email: true } },
            },
          },
        },
      });
    } else if (role === 'DRIVER') {
      const driver = await this.driversService.findByUserId(userId);
      return this.prisma.trip.findFirst({
        where: {
          driverId: driver.id,
          state: { in: activeStates },
        },
        include: {
          rider: { select: { id: true, email: true } },
        },
      });
    }

    return null;
  }
}

