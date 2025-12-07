import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminService,
  PendingDriver,
  ApprovalStats,
  ApprovalStatus,
} from '../services/admin.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-900">
      <!-- Header -->
      <header class="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700 px-6 py-4">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div>
              <h1 class="text-xl font-bold text-white">Admin Dashboard</h1>
              <p class="text-sm text-slate-400">Driver Management</p>
            </div>
          </div>
          <button
            (click)="logout()"
            class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            Logout
          </button>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-6 py-8">
        <!-- Stats Cards -->
        @if (stats()) {
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-slate-400 text-sm">Pending</p>
                  <p class="text-3xl font-bold text-amber-400">{{ stats()!.pending }}</p>
                </div>
                <div class="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <svg class="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                  </svg>
                </div>
              </div>
            </div>

            <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-slate-400 text-sm">Approved</p>
                  <p class="text-3xl font-bold text-green-400">{{ stats()!.approved }}</p>
                </div>
                <div class="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                  <svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                </div>
              </div>
            </div>

            <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-slate-400 text-sm">Rejected</p>
                  <p class="text-3xl font-bold text-red-400">{{ stats()!.rejected }}</p>
                </div>
                <div class="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
                  <svg class="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Filter Tabs -->
        <div class="flex gap-2 mb-6">
          @for (tab of tabs; track tab.value) {
            <button
              (click)="setFilter(tab.value)"
              [class]="activeFilter() === tab.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'"
              class="px-4 py-2 rounded-xl font-medium transition-all"
            >
              {{ tab.label }}
            </button>
          }
        </div>

        <!-- Drivers Table -->
        <div class="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          @if (loading()) {
            <div class="p-12 text-center">
              <div class="w-12 h-12 mx-auto mb-4 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
              <p class="text-slate-400">Loading drivers...</p>
            </div>
          } @else if (drivers().length === 0) {
            <div class="p-12 text-center">
              <svg class="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
              </svg>
              <p class="text-slate-400">No drivers found</p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-slate-900/50">
                  <tr>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Driver</th>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Vehicle</th>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                    <th class="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Registered</th>
                    <th class="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-700">
                  @for (driver of drivers(); track driver.id) {
                    <tr class="hover:bg-slate-700/30 transition-colors">
                      <td class="px-6 py-4">
                        <div>
                          <p class="text-white font-medium">{{ driver.user.email }}</p>
                          <p class="text-slate-400 text-sm">ID: {{ driver.id.slice(0, 8) }}...</p>
                        </div>
                      </td>
                      <td class="px-6 py-4">
                        <div>
                          <p class="text-white">{{ driver.vehicleModel }}</p>
                          <p class="text-slate-400 text-sm">{{ driver.vehiclePlate }}</p>
                        </div>
                      </td>
                      <td class="px-6 py-4">
                        <span
                          [class]="{
                            'bg-amber-500/10 text-amber-400 border-amber-500/20': driver.approvalStatus === 'PENDING',
                            'bg-green-500/10 text-green-400 border-green-500/20': driver.approvalStatus === 'APPROVED',
                            'bg-red-500/10 text-red-400 border-red-500/20': driver.approvalStatus === 'REJECTED'
                          }"
                          class="px-3 py-1 rounded-full text-xs font-medium border"
                        >
                          {{ driver.approvalStatus }}
                        </span>
                      </td>
                      <td class="px-6 py-4 text-slate-400 text-sm">
                        {{ formatDate(driver.createdAt) }}
                      </td>
                      <td class="px-6 py-4 text-right">
                        @if (driver.approvalStatus === 'PENDING') {
                          <div class="flex items-center justify-end gap-2">
                            <button
                              (click)="approveDriver(driver)"
                              class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-all"
                            >
                              Approve
                            </button>
                            <button
                              (click)="openRejectModal(driver)"
                              class="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all"
                            >
                              Reject
                            </button>
                          </div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </main>

      <!-- Rejection Modal -->
      @if (showRejectModal()) {
        <div class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div class="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6">
            <h3 class="text-xl font-semibold text-white mb-4">Reject Driver</h3>
            <p class="text-slate-400 mb-4">
              Please provide a reason for rejecting {{ selectedDriver()?.user?.email }}
            </p>
            <textarea
              [(ngModel)]="rejectionNote"
              class="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              rows="3"
              placeholder="Enter rejection reason..."
            ></textarea>
            <div class="flex justify-end gap-3 mt-6">
              <button
                (click)="closeRejectModal()"
                class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                (click)="confirmReject()"
                [disabled]="!rejectionNote.trim()"
                class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white font-medium rounded-xl transition-all"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  drivers = signal<PendingDriver[]>([]);
  stats = signal<ApprovalStats | null>(null);
  loading = signal(true);
  activeFilter = signal<ApprovalStatus | 'ALL'>('PENDING');
  showRejectModal = signal(false);
  selectedDriver = signal<PendingDriver | null>(null);
  rejectionNote = '';

  tabs = [
    { label: 'Pending', value: 'PENDING' as const },
    { label: 'Approved', value: 'APPROVED' as const },
    { label: 'Rejected', value: 'REJECTED' as const },
  ];

  constructor(
    private adminService: AdminService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadDrivers();
  }

  loadStats(): void {
    this.adminService.getApprovalStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (err) => console.error('Failed to load stats:', err),
    });
  }

  loadDrivers(): void {
    this.loading.set(true);
    const filter = this.activeFilter();

    const request =
      filter === 'PENDING'
        ? this.adminService.getPendingDrivers()
        : this.adminService.getDriversByStatus(filter as ApprovalStatus);

    request.subscribe({
      next: (drivers) => {
        this.drivers.set(drivers);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load drivers:', err);
        this.loading.set(false);
      },
    });
  }

  setFilter(filter: ApprovalStatus): void {
    this.activeFilter.set(filter);
    this.loadDrivers();
  }

  approveDriver(driver: PendingDriver): void {
    this.adminService
      .updateApprovalStatus(driver.id, { status: 'APPROVED' })
      .subscribe({
        next: () => {
          this.loadStats();
          this.loadDrivers();
        },
        error: (err) => console.error('Failed to approve driver:', err),
      });
  }

  openRejectModal(driver: PendingDriver): void {
    this.selectedDriver.set(driver);
    this.rejectionNote = '';
    this.showRejectModal.set(true);
  }

  closeRejectModal(): void {
    this.showRejectModal.set(false);
    this.selectedDriver.set(null);
    this.rejectionNote = '';
  }

  confirmReject(): void {
    const driver = this.selectedDriver();
    if (!driver || !this.rejectionNote.trim()) return;

    this.adminService
      .updateApprovalStatus(driver.id, {
        status: 'REJECTED',
        rejectionNote: this.rejectionNote,
      })
      .subscribe({
        next: () => {
          this.closeRejectModal();
          this.loadStats();
          this.loadDrivers();
        },
        error: (err) => console.error('Failed to reject driver:', err),
      });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  logout(): void {
    this.authService.logout();
  }
}

