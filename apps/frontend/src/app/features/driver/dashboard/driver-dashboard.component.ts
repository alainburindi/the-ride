import { Component, OnInit, OnDestroy, ViewChild, signal, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { MapComponent } from '../../../shared/components/map/map.component';
import { DriverService, Driver, Trip } from '../services/driver.service';
import { WebSocketService, RideOffer } from '../../../core/services/websocket.service';
import { AuthService } from '../../../core/services/auth.service';

type DriverState = 'offline' | 'online' | 'ride_offer' | 'en_route' | 'at_pickup' | 'in_trip';

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [CommonModule, MapComponent],
  template: `
    <div class="h-screen flex flex-col bg-slate-900">
      <!-- Header -->
      <header
        class="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700 px-4 py-3 flex items-center justify-between z-10"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
              />
              <path
                d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-2a4 4 0 00-4-4h-3V5a1 1 0 00-1-1H3z"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-white font-semibold">Driver Mode</h1>
            <p class="text-xs" [class]="isOnline() ? 'text-green-400' : 'text-slate-400'">
              {{ isOnline() ? 'Online' : 'Offline' }}
            </p>
          </div>
        </div>
        <button (click)="logout()" class="text-slate-400 hover:text-white transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </header>

      <!-- Approval Status Banner -->
      @if (driver()?.approvalStatus === 'PENDING') {
      <div class="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          <p class="text-amber-300 text-sm">
            Your account is pending approval. You cannot go online yet.
          </p>
        </div>
      </div>
      } @if (driver()?.approvalStatus === 'REJECTED') {
      <div class="bg-red-500/10 border-b border-red-500/20 px-4 py-3">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          <p class="text-red-300 text-sm">Your application was rejected. Please contact support.</p>
        </div>
      </div>
      }

      <!-- Map -->
      <div class="flex-1 relative">
        <app-map #map />
      </div>

      <!-- Ride Offer Modal - Fixed position to overlay everything -->
      @if (state() === 'ride_offer' && currentOffer()) {
      <div
        class="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-end justify-center p-4"
      >
        <div
          class="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden animate-slide-up"
        >
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-semibold text-white">New Ride Request</h3>
              <div class="text-right">
                <p class="text-2xl font-bold text-white">{{ offerTimeout() }}s</p>
                <p class="text-xs text-slate-400">to respond</p>
              </div>
            </div>

            <div class="space-y-3 mb-6">
              <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
                <div class="w-3 h-3 bg-green-500 rounded-full"></div>
                <div>
                  <p class="text-xs text-slate-400">Pickup</p>
                  <p class="text-white">
                    {{ currentOffer()!.origin.lat.toFixed(4) }},
                    {{ currentOffer()!.origin.lon.toFixed(4) }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
                <div class="w-3 h-3 bg-red-500 rounded-full"></div>
                <div>
                  <p class="text-xs text-slate-400">Dropoff</p>
                  <p class="text-white">
                    {{ currentOffer()!.destination.lat.toFixed(4) }},
                    {{ currentOffer()!.destination.lon.toFixed(4) }}
                  </p>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between mb-6 text-center">
              <div>
                <p class="text-2xl font-bold text-white">
                  {{ Math.round(currentOffer()!.pickupEtaSec / 60) }}
                </p>
                <p class="text-xs text-slate-400">min to pickup</p>
              </div>
              <div class="w-px h-8 bg-slate-700"></div>
              <div>
                <p class="text-2xl font-bold text-white">
                  {{ Math.round(currentOffer()!.tripEtaSec / 60) }}
                </p>
                <p class="text-xs text-slate-400">min trip</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <button
                (click)="rejectOffer()"
                class="py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all"
              >
                Decline
              </button>
              <button
                (click)="acceptOffer()"
                class="py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-all"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
      }

      <!-- Bottom Panel -->
      <div class="bg-slate-800 border-t border-slate-700 p-4">
        @switch (state()) { @case ('offline') {
        <button
          (click)="goOnline()"
          [disabled]="driver()?.approvalStatus !== 'APPROVED'"
          class="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-3"
        >
          <div class="w-3 h-3 bg-white rounded-full"></div>
          Go Online
        </button>
        } @case ('online') {
        <div class="space-y-3">
          <div class="flex items-center justify-center gap-3 py-4">
            <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span class="text-white font-medium">Waiting for ride requests...</span>
          </div>
          <button
            (click)="goOffline()"
            class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all"
          >
            Go Offline
          </button>
        </div>
        } @case ('en_route') {
        <div class="space-y-3">
          <div class="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <p class="text-indigo-300 text-sm">Heading to pickup location</p>
          </div>
          <button
            (click)="arriveAtPickup()"
            class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
          >
            I've Arrived
          </button>
        </div>
        } @case ('at_pickup') {
        <div class="space-y-3">
          <div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p class="text-amber-300 text-sm">Waiting for rider...</p>
          </div>
          <button
            (click)="startTrip()"
            class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-all"
          >
            Start Trip
          </button>
        </div>
        } @case ('in_trip') {
        <div class="space-y-3">
          <div
            class="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between"
          >
            <div>
              <p class="text-green-300 text-sm">Trip in progress</p>
              <p class="text-white font-semibold">Heading to destination</p>
            </div>
            <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <button
            (click)="completeTrip()"
            class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
          >
            Complete Trip
          </button>
        </div>
        } }
      </div>
    </div>
  `,
  styles: `
    @keyframes slide-up {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    .animate-slide-up {
      animation: slide-up 0.3s ease-out;
    }
  `,
})
export class DriverDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('map') mapComponent!: MapComponent;

  state = signal<DriverState>('offline');
  driver = signal<Driver | null>(null);
  isOnline = signal(false);
  currentOffer = signal<RideOffer | null>(null);
  currentTrip = signal<Trip | null>(null);
  offerTimeout = signal(30);

  protected Math = Math;

  private subscriptions: Subscription[] = [];
  private locationInterval: Subscription | null = null;
  private offerTimeoutInterval: Subscription | null = null;

  constructor(
    private driverService: DriverService,
    private wsService: WebSocketService,
    private authService: AuthService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadProfile();
    this.wsService.connect();

    // Listen for ride offers
    this.subscriptions.push(
      this.wsService.rideOffer$.subscribe((offer) => {
        this.ngZone.run(() => this.handleRideOffer(offer));
      })
    );

    // Listen for ride cancellations
    this.subscriptions.push(
      this.wsService.rideCancelled$.subscribe(() => {
        this.ngZone.run(() => {
          if (this.state() === 'ride_offer') {
            this.currentOffer.set(null);
            this.state.set('online');
            this.stopOfferTimeout();
          }
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.stopLocationUpdates();
    this.stopOfferTimeout();
    this.wsService.disconnect();
  }

  loadProfile(): void {
    this.driverService.getMyProfile().subscribe({
      next: (driver) => {
        this.driver.set(driver);
        this.driverService.currentDriver.set(driver);
        if (driver.status === 'ONLINE') {
          this.isOnline.set(true);
          // Only set state to 'online' if we're not already handling an offer
          if (this.state() === 'offline') {
            this.state.set('online');
          }
          this.startLocationUpdates();
        }
      },
      error: (err) => console.error('Failed to load profile:', err),
    });
  }

  goOnline(): void {
    this.driverService.updateStatus('ONLINE').subscribe({
      next: (driver) => {
        this.driver.set(driver);
        this.isOnline.set(true);
        this.state.set('online');
        this.startLocationUpdates();
      },
      error: (err) => console.error('Failed to go online:', err),
    });
  }

  goOffline(): void {
    this.driverService.updateStatus('OFFLINE').subscribe({
      next: (driver) => {
        this.driver.set(driver);
        this.isOnline.set(false);
        this.state.set('offline');
        this.stopLocationUpdates();
      },
      error: (err) => console.error('Failed to go offline:', err),
    });
  }

  private startLocationUpdates(): void {
    // Update location every 5 seconds
    this.locationInterval = interval(5000).subscribe(() => {
      this.sendLocationUpdate();
    });
    // Send initial location
    this.sendLocationUpdate();
  }

  private stopLocationUpdates(): void {
    this.locationInterval?.unsubscribe();
    this.locationInterval = null;
  }

  private async sendLocationUpdate(): Promise<void> {
    try {
      const position = await this.mapComponent.getCurrentLocation();
      this.wsService.updateLocation(position.coords.latitude, position.coords.longitude);
    } catch (err) {
      console.warn('Failed to get location, using demo location:', err);
      // Use Kigali demo location (same as map center for testing)
      // Add small random offset to simulate movement
      const baseLatKigali = -1.9403;
      const baseLonKigali = 29.8739;
      const offset = (Math.random() - 0.5) * 0.01; // ~500m random offset
      this.wsService.updateLocation(baseLatKigali + offset, baseLonKigali + offset);
    }
  }

  private handleRideOffer(offer: RideOffer): void {
    this.currentOffer.set(offer);
    this.state.set('ride_offer');
    this.offerTimeout.set(30);
    // Show markers on map
    this.mapComponent.setMarker({
      id: 'pickup',
      lat: offer.origin.lat,
      lon: offer.origin.lon,
      type: 'pickup',
      label: 'Pickup',
    });
    this.mapComponent.setMarker({
      id: 'dropoff',
      lat: offer.destination.lat,
      lon: offer.destination.lon,
      type: 'dropoff',
      label: 'Dropoff',
    });

    // Start countdown
    this.offerTimeoutInterval = interval(1000).subscribe(() => {
      const current = this.offerTimeout();
      if (current <= 1) {
        this.rejectOffer();
      } else {
        this.offerTimeout.set(current - 1);
      }
    });
  }

  private stopOfferTimeout(): void {
    this.offerTimeoutInterval?.unsubscribe();
    this.offerTimeoutInterval = null;
  }

  acceptOffer(): void {
    const offer = this.currentOffer();
    if (!offer) return;

    this.wsService.acceptRide(offer.requestId);
    this.stopOfferTimeout();
    this.state.set('en_route');
  }

  rejectOffer(): void {
    const offer = this.currentOffer();
    if (offer) {
      this.wsService.rejectRide(offer.requestId);
    }
    this.stopOfferTimeout();
    this.currentOffer.set(null);
    this.mapComponent.clearMarkers();
    this.state.set('online');
  }

  arriveAtPickup(): void {
    const trip = this.currentTrip();
    if (trip) {
      this.driverService.arriveAtPickup(trip.id).subscribe({
        next: () => this.state.set('at_pickup'),
        error: (err) => console.error('Failed to update arrival:', err),
      });
    } else {
      this.state.set('at_pickup');
    }
  }

  startTrip(): void {
    const trip = this.currentTrip();
    if (trip) {
      this.driverService.startTrip(trip.id).subscribe({
        next: () => this.state.set('in_trip'),
        error: (err) => console.error('Failed to start trip:', err),
      });
    } else {
      this.state.set('in_trip');
    }
  }

  completeTrip(): void {
    const trip = this.currentTrip();
    if (trip) {
      this.driverService.completeTrip(trip.id).subscribe({
        next: () => {
          this.resetState();
        },
        error: (err) => console.error('Failed to complete trip:', err),
      });
    } else {
      this.resetState();
    }
  }

  private resetState(): void {
    this.currentOffer.set(null);
    this.currentTrip.set(null);
    this.mapComponent.clearMarkers();
    this.state.set('online');
  }

  logout(): void {
    if (this.isOnline()) {
      this.goOffline();
    }
    this.authService.logout();
  }
}
