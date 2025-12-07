import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface RideRequest {
  origin: Coordinates;
  destination: Coordinates;
}

export interface RideResponse {
  id: string;
  status: string;
  estimatedDistance: number;
  estimatedDuration: number;
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
}

export interface Trip {
  id: string;
  status: 'DRIVER_ASSIGNED' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  driverId: string;
  driverName?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  estimatedDistance: number;
  estimatedDuration: number;
}

@Injectable({
  providedIn: 'root',
})
export class RideService {
  readonly activeRide = signal<RideResponse | null>(null);
  readonly activeTrip = signal<Trip | null>(null);
  readonly isSearching = signal(false);

  constructor(private http: HttpClient) {}

  requestRide(request: RideRequest): Observable<RideResponse> {
    return this.http.post<RideResponse>(`${environment.apiUrl}/rides/request`, request);
  }

  cancelRide(rideId: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/rides/${rideId}`);
  }

  getActiveTrip(): Observable<Trip | null> {
    return this.http.get<Trip | null>(`${environment.apiUrl}/trips/active`);
  }

  rateTrip(tripId: string, rating: number): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/trips/${tripId}/rate`, {
      rating,
    });
  }
}
