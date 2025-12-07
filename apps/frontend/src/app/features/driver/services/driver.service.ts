import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type DriverStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';

export interface Driver {
  id: string;
  userId: string;
  vehiclePlate: string;
  vehicleModel: string;
  status: DriverStatus;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface Trip {
  id: string;
  status: 'DRIVER_ASSIGNED' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  riderId: string;
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
export class DriverService {
  readonly currentDriver = signal<Driver | null>(null);
  readonly isOnline = signal(false);
  readonly currentTrip = signal<Trip | null>(null);

  constructor(private http: HttpClient) {}

  getMyProfile(): Observable<Driver> {
    return this.http.get<Driver>(`${environment.apiUrl}/drivers/me`);
  }

  updateStatus(status: DriverStatus): Observable<Driver> {
    return this.http.patch<Driver>(`${environment.apiUrl}/drivers/me/status`, {
      status,
    });
  }

  getActiveTrip(): Observable<Trip | null> {
    return this.http.get<Trip | null>(`${environment.apiUrl}/trips/driver/active`);
  }

  startTrip(tripId: string): Observable<Trip> {
    return this.http.patch<Trip>(`${environment.apiUrl}/trips/${tripId}/state`, {
      state: 'IN_PROGRESS',
    });
  }

  completeTrip(tripId: string): Observable<Trip> {
    return this.http.patch<Trip>(`${environment.apiUrl}/trips/${tripId}/state`, {
      state: 'COMPLETED',
    });
  }

  arriveAtPickup(tripId: string): Observable<Trip> {
    return this.http.patch<Trip>(`${environment.apiUrl}/trips/${tripId}/state`, {
      state: 'ARRIVED',
    });
  }
}
