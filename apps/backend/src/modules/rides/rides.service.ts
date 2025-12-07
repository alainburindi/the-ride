import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MatchingService, MatchCandidate } from '../matching/matching.service';
import { TripsService } from '../trips/trips.service';
import {
  WsGateway,
  DriverOfferMessage,
  RiderStatusMessage,
} from '../../ws/ws.gateway';
import { RideRequestStatus } from '@prisma/client';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';

const OFFER_TIMEOUT_MS = 30000; // 30 seconds for driver to respond

interface PendingRequest {
  requestId: string;
  riderId: string;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  currentDriver: MatchCandidate | null;
  declinedDrivers: string[];
  timeoutHandle?: NodeJS.Timeout;
}

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly tripsService: TripsService,
    @Inject(forwardRef(() => WsGateway))
    private readonly wsGateway: WsGateway
  ) {}

  /**
   * Create a new ride request and start matching
   */
  async createRideRequest(riderId: string, dto: CreateRideRequestDto) {
    // Create ride request in database
    const rideRequest = await this.prisma.rideRequest.create({
      data: {
        riderId,
        originLat: dto.origin.lat,
        originLon: dto.origin.lon,
        destinationLat: dto.destination.lat,
        destinationLon: dto.destination.lon,
        status: RideRequestStatus.MATCHING,
      },
    });

    this.logger.log(
      `Created ride request ${rideRequest.id} for rider ${riderId}`
    );

    // Start matching process
    await this.startMatching(
      rideRequest.id,
      riderId,
      dto.origin,
      dto.destination
    );

    return {
      requestId: rideRequest.id,
      status: 'matching',
    };
  }

  /**
   * Start the matching process for a ride request
   */
  private async startMatching(
    requestId: string,
    riderId: string,
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number }
  ) {
    // Initialize pending request tracking
    const pendingRequest: PendingRequest = {
      requestId,
      riderId,
      origin,
      destination,
      currentDriver: null,
      declinedDrivers: [],
    };
    this.pendingRequests.set(requestId, pendingRequest);

    // Find matches
    const result = await this.matchingService.findMatchesWithExpansion({
      origin: { lon: origin.lon, lat: origin.lat },
      destination: { lon: destination.lon, lat: destination.lat },
    });

    if (!result.bestMatch) {
      this.logger.log(`No drivers found for request ${requestId}`);
      await this.handleNoDriversFound(requestId, riderId);
      return;
    }

    // Send offer to best match
    await this.sendOfferToDriver(requestId, result.bestMatch);
  }

  /**
   * Send ride offer to a driver
   */
  private async sendOfferToDriver(
    requestId: string,
    candidate: MatchCandidate
  ) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    pendingRequest.currentDriver = candidate;

    // Clear any existing timeout
    if (pendingRequest.timeoutHandle) {
      clearTimeout(pendingRequest.timeoutHandle);
    }

    const offer: DriverOfferMessage = {
      type: 'driver.offer',
      requestId,
      origin: pendingRequest.origin,
      destination: pendingRequest.destination,
      pickupEtaSec: candidate.pickupEta.durationSec,
      tripEtaSec: candidate.tripEta.durationSec,
    };

    const sent = this.wsGateway.sendOfferToDriver(candidate.driverId, offer);

    if (!sent) {
      // Driver not connected, try next
      this.logger.warn(
        `Driver ${candidate.driverId} not connected, trying next`
      );
      pendingRequest.declinedDrivers.push(candidate.driverId);
      await this.tryNextDriver(requestId);
      return;
    }

    this.logger.log(
      `Sent offer to driver ${candidate.driverId} for request ${requestId}`
    );

    // Set timeout for driver response
    pendingRequest.timeoutHandle = setTimeout(() => {
      this.handleDriverTimeout(requestId);
    }, OFFER_TIMEOUT_MS);
  }

  /**
   * Handle driver accepting a ride
   */
  async handleDriverAccept(requestId: string, driverId: string) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      this.logger.warn(`Request ${requestId} not found or already processed`);
      return null;
    }

    // Verify it's the correct driver
    if (pendingRequest.currentDriver?.driverId !== driverId) {
      this.logger.warn(
        `Driver ${driverId} cannot accept request ${requestId} - not the current offer recipient`
      );
      return null;
    }

    // Clear timeout
    if (pendingRequest.timeoutHandle) {
      clearTimeout(pendingRequest.timeoutHandle);
    }

    // Create trip
    const trip = await this.tripsService.create({
      rideRequestId: requestId,
      riderId: pendingRequest.riderId,
      driverId,
      origin: pendingRequest.origin,
      destination: pendingRequest.destination,
      pickupEtaSec: pendingRequest.currentDriver.pickupEta.durationSec,
      tripEtaSec: pendingRequest.currentDriver.tripEta.durationSec,
      distanceMeters:
        pendingRequest.currentDriver.pickupEta.distanceMeters +
        pendingRequest.currentDriver.tripEta.distanceMeters,
    });

    // Notify rider
    const riderStatus: RiderStatusMessage = {
      type: 'rider.status',
      requestId,
      status: 'matched',
      tripId: trip.id,
      driverId,
      pickupEtaSec: pendingRequest.currentDriver.pickupEta.durationSec,
    };
    this.wsGateway.sendStatusToRider(pendingRequest.riderId, riderStatus);

    // Clean up
    this.pendingRequests.delete(requestId);

    this.logger.log(`Trip ${trip.id} created for request ${requestId}`);

    return trip;
  }

  /**
   * Handle driver declining a ride
   */
  async handleDriverDecline(requestId: string, driverId: string) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    if (pendingRequest.currentDriver?.driverId !== driverId) {
      return;
    }

    // Clear timeout
    if (pendingRequest.timeoutHandle) {
      clearTimeout(pendingRequest.timeoutHandle);
    }

    pendingRequest.declinedDrivers.push(driverId);
    pendingRequest.currentDriver = null;

    this.logger.log(`Driver ${driverId} declined request ${requestId}`);

    // Notify rider that a driver declined and we're searching for another
    const declinedStatus: RiderStatusMessage = {
      type: 'rider.status',
      requestId,
      status: 'driver_declined',
      message: 'Driver unavailable, finding another driver...',
    };
    this.wsGateway.sendStatusToRider(pendingRequest.riderId, declinedStatus);

    // Try next driver
    await this.tryNextDriver(requestId);
  }

  /**
   * Handle driver not responding in time
   */
  private async handleDriverTimeout(requestId: string) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest || !pendingRequest.currentDriver) {
      return;
    }

    this.logger.log(
      `Driver ${pendingRequest.currentDriver.driverId} timed out for request ${requestId}`
    );

    pendingRequest.declinedDrivers.push(pendingRequest.currentDriver.driverId);
    pendingRequest.currentDriver = null;

    // Notify rider that we're searching for another driver
    const searchingStatus: RiderStatusMessage = {
      type: 'rider.status',
      requestId,
      status: 'matching',
    };
    this.wsGateway.sendStatusToRider(pendingRequest.riderId, searchingStatus);

    // Try next driver
    await this.tryNextDriver(requestId);
  }

  /**
   * Try to find the next available driver
   */
  private async tryNextDriver(requestId: string) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    const nextCandidate = await this.matchingService.getNextCandidate(
      {
        origin: {
          lon: pendingRequest.origin.lon,
          lat: pendingRequest.origin.lat,
        },
        destination: {
          lon: pendingRequest.destination.lon,
          lat: pendingRequest.destination.lat,
        },
      },
      pendingRequest.declinedDrivers
    );

    if (!nextCandidate) {
      await this.handleNoDriversFound(requestId, pendingRequest.riderId);
      return;
    }

    await this.sendOfferToDriver(requestId, nextCandidate);
  }

  /**
   * Handle case when no drivers are available
   */
  private async handleNoDriversFound(requestId: string, riderId: string) {
    // Update request status
    await this.prisma.rideRequest.update({
      where: { id: requestId },
      data: { status: RideRequestStatus.EXPIRED },
    });

    // Notify rider
    const status: RiderStatusMessage = {
      type: 'rider.status',
      requestId,
      status: 'no_drivers',
    };
    this.wsGateway.sendStatusToRider(riderId, status);

    // Clean up
    this.pendingRequests.delete(requestId);

    this.logger.log(`No drivers found for request ${requestId}`);
  }

  /**
   * Cancel a ride request
   */
  async cancelRequest(requestId: string, userId: string) {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: { id: requestId },
    });

    if (!rideRequest) {
      throw new NotFoundException(`Ride request ${requestId} not found`);
    }

    if (rideRequest.riderId !== userId) {
      throw new BadRequestException('You can only cancel your own requests');
    }

    if (rideRequest.status === RideRequestStatus.MATCHED) {
      throw new BadRequestException(
        'Cannot cancel a matched request. Cancel the trip instead.'
      );
    }

    // Clear pending request
    const pendingRequest = this.pendingRequests.get(requestId);
    if (pendingRequest?.timeoutHandle) {
      clearTimeout(pendingRequest.timeoutHandle);
    }
    this.pendingRequests.delete(requestId);

    // Update status
    return this.prisma.rideRequest.update({
      where: { id: requestId },
      data: { status: RideRequestStatus.CANCELED },
    });
  }

  /**
   * Get ride request by ID
   */
  async getRequest(requestId: string) {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: { id: requestId },
      include: {
        rider: { select: { id: true, email: true } },
        trip: true,
      },
    });

    if (!rideRequest) {
      throw new NotFoundException(`Ride request ${requestId} not found`);
    }

    return rideRequest;
  }

  /**
   * Get all ride requests for a user
   */
  async getUserRequests(userId: string) {
    return this.prisma.rideRequest.findMany({
      where: { riderId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        trip: true,
      },
    });
  }
}
