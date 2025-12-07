import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface RideOffer {
  rideRequestId: string;
  riderId: string;
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  estimatedDistance: number;
  estimatedDuration: number;
  expiresAt: string;
}

export interface RideAccepted {
  tripId: string;
  driverId: string;
  driverName?: string;
  vehiclePlate?: string;
  eta: number;
}

export interface LocationUpdate {
  driverId: string;
  lat: number;
  lon: number;
  ts: number;
}

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket: Socket | null = null;
  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  // Event subjects
  private rideOfferSubject = new Subject<RideOffer>();
  private rideAcceptedSubject = new Subject<RideAccepted>();
  private rideCancelledSubject = new Subject<{ rideRequestId: string }>();
  private locationUpdateSubject = new Subject<LocationUpdate>();
  private tripUpdateSubject = new Subject<any>();

  // Observables
  readonly rideOffer$ = this.rideOfferSubject.asObservable();
  readonly rideAccepted$ = this.rideAcceptedSubject.asObservable();
  readonly rideCancelled$ = this.rideCancelledSubject.asObservable();
  readonly locationUpdate$ = this.locationUpdateSubject.asObservable();
  readonly tripUpdate$ = this.tripUpdateSubject.asObservable();

  constructor(private authService: AuthService) {}

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) {
      console.error('No auth token available for WebSocket connection');
      return;
    }

    this.socket = io(`${environment.wsUrl}/ws`, {
      auth: { token },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this._connected.set(true);
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this._connected.set(false);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Listen for events
    this.socket.on('ride:offer', (data: RideOffer) => {
      console.log('Received ride offer:', data);
      this.rideOfferSubject.next(data);
    });

    this.socket.on('ride:accepted', (data: RideAccepted) => {
      console.log('Ride accepted:', data);
      this.rideAcceptedSubject.next(data);
    });

    this.socket.on('ride:cancelled', (data: { rideRequestId: string }) => {
      console.log('Ride cancelled:', data);
      this.rideCancelledSubject.next(data);
    });

    this.socket.on('location:update', (data: LocationUpdate) => {
      this.locationUpdateSubject.next(data);
    });

    this.socket.on('trip:update', (data: any) => {
      console.log('Trip update:', data);
      this.tripUpdateSubject.next(data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._connected.set(false);
    }
  }

  // Driver methods
  acceptRide(rideRequestId: string): void {
    this.socket?.emit('driver.accept', { requestId: rideRequestId });
  }

  rejectRide(rideRequestId: string): void {
    this.socket?.emit('driver.decline', { requestId: rideRequestId });
  }

  updateLocation(lat: number, lon: number): void {
    this.socket?.emit('driver.location', { lat, lon, ts: Date.now() });
  }

  // Trip updates
  startTrip(tripId: string): void {
    this.socket?.emit('trip:start', { tripId });
  }

  completeTrip(tripId: string): void {
    this.socket?.emit('trip:complete', { tripId });
  }
}
