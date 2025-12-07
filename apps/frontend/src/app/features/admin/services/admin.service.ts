import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PendingDriver {
  id: string;
  userId: string;
  vehiclePlate: string;
  vehicleModel: string;
  status: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  user: {
    id: string;
    email: string;
  };
}

export interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
}

export interface ApproveDriverDto {
  status: ApprovalStatus;
  rejectionNote?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  readonly pendingDrivers = signal<PendingDriver[]>([]);
  readonly stats = signal<ApprovalStats | null>(null);

  constructor(private http: HttpClient) {}

  getPendingDrivers(): Observable<PendingDriver[]> {
    return this.http.get<PendingDriver[]>(
      `${environment.apiUrl}/drivers/admin/pending`
    );
  }

  getDriversByStatus(status: ApprovalStatus): Observable<PendingDriver[]> {
    return this.http.get<PendingDriver[]>(
      `${environment.apiUrl}/drivers/admin/by-status?status=${status}`
    );
  }

  getApprovalStats(): Observable<ApprovalStats> {
    return this.http.get<ApprovalStats>(
      `${environment.apiUrl}/drivers/admin/stats`
    );
  }

  updateApprovalStatus(
    driverId: string,
    dto: ApproveDriverDto
  ): Observable<PendingDriver> {
    return this.http.patch<PendingDriver>(
      `${environment.apiUrl}/drivers/admin/${driverId}/approval`,
      dto
    );
  }
}

