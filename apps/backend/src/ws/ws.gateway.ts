import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../modules/auth/auth.service';
import { LocationsService } from '../modules/locations/locations.service';
import { DriversService } from '../modules/drivers/drivers.service';
import { UserRole, DriverStatus } from '@prisma/client';

// Message types
export interface DriverLocationMessage {
  type: 'driver.location';
  driverId: string;
  lat: number;
  lon: number;
  ts: number;
}

export interface DriverOfferMessage {
  type: 'driver.offer';
  requestId: string;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  pickupEtaSec: number;
  tripEtaSec: number;
}

export interface DriverAcceptMessage {
  type: 'driver.accept';
  requestId: string;
  driverId: string;
}

export interface DriverDeclineMessage {
  type: 'driver.decline';
  requestId: string;
  driverId: string;
}

export interface RiderStatusMessage {
  type: 'rider.status';
  requestId: string;
  status: 'matching' | 'matched' | 'no_drivers' | 'trip_started' | 'trip_completed';
  tripId?: string;
  driverId?: string;
  pickupEtaSec?: number;
}

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    driverId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/ws',
})
export class WsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);
  private readonly connectedClients = new Map<string, AuthenticatedSocket>();
  private readonly driverSockets = new Map<string, string>(); // driverId -> socketId
  private readonly riderSockets = new Map<string, string>(); // riderId -> socketId

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly locationsService: LocationsService,
    private readonly driversService: DriversService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from query or auth header
      const token =
        client.handshake.query.token as string ||
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Verify token
      const payload = this.authService.verifyToken(token);
      const user = await this.authService.validateUser(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to socket
      client.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        driverId: user.driver?.id,
      };

      // Track connection
      this.connectedClients.set(client.id, client);

      if (user.role === UserRole.DRIVER && user.driver) {
        this.driverSockets.set(user.driver.id, client.id);
        // Join driver-specific room
        client.join(`driver:${user.driver.id}`);
        this.logger.log(`Driver ${user.driver.id} connected`);
      } else if (user.role === UserRole.RIDER) {
        this.riderSockets.set(user.id, client.id);
        // Join rider-specific room
        client.join(`rider:${user.id}`);
        this.logger.log(`Rider ${user.id} connected`);
      }

      client.emit('connected', { userId: user.id, role: user.role });
    } catch (error) {
      this.logger.error(`Connection failed: ${error}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      if (client.user.role === UserRole.DRIVER && client.user.driverId) {
        this.driverSockets.delete(client.user.driverId);
        // Remove driver location on disconnect
        this.locationsService.removeDriverLocation(client.user.driverId);
        this.logger.log(`Driver ${client.user.driverId} disconnected`);
      } else if (client.user.role === UserRole.RIDER) {
        this.riderSockets.delete(client.user.userId);
        this.logger.log(`Rider ${client.user.userId} disconnected`);
      }
    }
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('driver.location')
  async handleDriverLocation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: DriverLocationMessage,
  ) {
    if (client.user?.role !== UserRole.DRIVER) {
      return { error: 'Only drivers can send location updates' };
    }

    const driverId = client.user.driverId;
    if (!driverId) {
      return { error: 'Driver profile not found' };
    }

    // Validate driverId matches authenticated user
    if (data.driverId && data.driverId !== driverId) {
      return { error: 'Driver ID mismatch' };
    }

    await this.locationsService.updateDriverLocation({
      driverId,
      lat: data.lat,
      lon: data.lon,
      ts: data.ts || Date.now(),
    });

    return { success: true };
  }

  @SubscribeMessage('driver.accept')
  async handleDriverAccept(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: DriverAcceptMessage,
  ) {
    if (client.user?.role !== UserRole.DRIVER) {
      return { error: 'Only drivers can accept rides' };
    }

    const driverId = client.user.driverId;
    if (!driverId) {
      return { error: 'Driver profile not found' };
    }

    this.logger.log(`Driver ${driverId} accepted request ${data.requestId}`);

    // Emit event that will be handled by RidesModule
    this.server.emit('internal:driver.accept', {
      requestId: data.requestId,
      driverId,
    });

    return { success: true, requestId: data.requestId };
  }

  @SubscribeMessage('driver.decline')
  async handleDriverDecline(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: DriverDeclineMessage,
  ) {
    if (client.user?.role !== UserRole.DRIVER) {
      return { error: 'Only drivers can decline rides' };
    }

    const driverId = client.user.driverId;
    if (!driverId) {
      return { error: 'Driver profile not found' };
    }

    this.logger.log(`Driver ${driverId} declined request ${data.requestId}`);

    // Emit event that will be handled by RidesModule
    this.server.emit('internal:driver.decline', {
      requestId: data.requestId,
      driverId,
    });

    return { success: true };
  }

  // ==================== Outbound Messages ====================

  /**
   * Send ride offer to a specific driver
   */
  sendOfferToDriver(driverId: string, offer: DriverOfferMessage) {
    const socketId = this.driverSockets.get(driverId);
    if (socketId) {
      this.server.to(socketId).emit('driver.offer', offer);
      this.logger.debug(`Sent offer to driver ${driverId}`);
      return true;
    }
    this.logger.warn(`Driver ${driverId} not connected`);
    return false;
  }

  /**
   * Send status update to a rider
   */
  sendStatusToRider(riderId: string, status: RiderStatusMessage) {
    const socketId = this.riderSockets.get(riderId);
    if (socketId) {
      this.server.to(socketId).emit('rider.status', status);
      this.logger.debug(`Sent status to rider ${riderId}: ${status.status}`);
      return true;
    }
    this.logger.warn(`Rider ${riderId} not connected`);
    return false;
  }

  /**
   * Check if a driver is currently connected
   */
  isDriverConnected(driverId: string): boolean {
    return this.driverSockets.has(driverId);
  }

  /**
   * Check if a rider is currently connected
   */
  isRiderConnected(riderId: string): boolean {
    return this.riderSockets.has(riderId);
  }

  /**
   * Get count of connected clients
   */
  getConnectionStats() {
    return {
      total: this.connectedClients.size,
      drivers: this.driverSockets.size,
      riders: this.riderSockets.size,
    };
  }
}

