import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { ReplaySubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface RideOffer {
  type: 'driver.offer';
  requestId: string;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  pickupEtaSec: number;
  tripEtaSec: number;
}

export interface RiderStatus {
  type: 'rider.status';
  requestId: string;
  status:
    | 'matching'
    | 'matched'
    | 'no_drivers'
    | 'driver_declined'
    | 'trip_started'
    | 'trip_completed';
  tripId?: string;
  driverId?: string;
  pickupEtaSec?: number;
  message?: string;
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

  // Event subjects - using ReplaySubject(1) to ensure late subscribers get the last value
  private rideOfferSubject = new ReplaySubject<RideOffer>(1);
  private riderStatusSubject = new ReplaySubject<RiderStatus>(1);
  private rideCancelledSubject = new Subject<{ rideRequestId: string }>();
  private locationUpdateSubject = new Subject<LocationUpdate>();
  private tripUpdateSubject = new Subject<any>();

  // Observables
  readonly rideOffer$ = this.rideOfferSubject.asObservable();
  readonly riderStatus$ = this.riderStatusSubject.asObservable();
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

    this.socket.on('error', (error: { message?: string }) => {
      console.error('WebSocket error:', error);
      // Logout user if authentication failed
      if (error?.message === 'Authentication failed') {
        this.disconnect();
        this.authService.logout();
      }
    });

    // Listen for events from backend
    // Driver receives ride offers
    this.socket.on('driver.offer', (data: RideOffer) => {
      this.rideOfferSubject.next(data);
    });

    // Rider receives status updates
    this.socket.on('rider.status', (data: RiderStatus) => {
      this.riderStatusSubject.next(data);
    });

    this.socket.on('ride:cancelled', (data: { rideRequestId: string }) => {
      this.rideCancelledSubject.next(data);
    });

    // Location updates broadcast to riders
    this.socket.on('driver.location', (data: LocationUpdate) => {
      this.locationUpdateSubject.next(data);
    });

    this.socket.on('trip:update', (data: any) => {
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
