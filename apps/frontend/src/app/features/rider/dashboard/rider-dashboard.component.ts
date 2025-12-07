import { Component, OnInit, OnDestroy, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MapComponent, MapClickEvent } from '../../../shared/components/map/map.component';
import { RideService, RideRequest } from '../services/ride.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { AuthService } from '../../../core/services/auth.service';

type RideState =
  | 'idle'
  | 'selecting_pickup'
  | 'selecting_dropoff'
  | 'searching'
  | 'matched'
  | 'in_trip';

@Component({
  selector: 'app-rider-dashboard',
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
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-white font-semibold">The RIDE</h1>
            <p class="text-xs text-slate-400">Ready to go</p>
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

      <!-- Map -->
      <div class="flex-1 relative">
        <app-map
          #map
          [clickable]="state() === 'selecting_pickup' || state() === 'selecting_dropoff'"
          (mapClick)="onMapClick($event)"
        />

        <!-- Instructions Overlay -->
        @if (state() === 'selecting_pickup' || state() === 'selecting_dropoff') {
        <div
          class="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-xl px-6 py-3 rounded-full border border-slate-700 shadow-lg"
        >
          <p class="text-white font-medium">
            @if (state() === 'selecting_pickup') { Tap to select pickup location } @else { Tap to
            select dropoff location }
          </p>
        </div>
        }

        <!-- Searching Overlay -->
        @if (state() === 'searching') {
        <div
          class="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center"
        >
          <div class="text-center">
            <div class="w-16 h-16 mx-auto mb-4 relative">
              <div class="absolute inset-0 border-4 border-indigo-500/30 rounded-full"></div>
              <div
                class="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"
              ></div>
            </div>
            <h3 class="text-xl font-semibold text-white mb-2">Finding your driver</h3>
            <p class="text-slate-400">This usually takes less than a minute</p>
            <button
              (click)="cancelRequest()"
              class="mt-6 px-6 py-2 text-red-400 hover:text-red-300 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
        }
      </div>

      <!-- Bottom Panel -->
      <div class="bg-slate-800 border-t border-slate-700 p-4">
        @switch (state()) { @case ('idle') {
        <button
          (click)="startBooking()"
          class="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-3"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Where to?
        </button>
        } @case ('selecting_pickup') {
        <div class="space-y-3">
          <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
            <div class="w-3 h-3 bg-green-500 rounded-full"></div>
            <span class="text-slate-400 flex-1">
              @if (pickup()) {
              {{ pickup()!.lat.toFixed(4) }}, {{ pickup()!.lon.toFixed(4) }}
              } @else { Select pickup on map }
            </span>
            <button
              (click)="useCurrentLocation()"
              [disabled]="gettingLocation()"
              class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
            >
              @if (gettingLocation()) {
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              } @else {
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              } My Location
            </button>
          </div>
          @if (pickup()) {
          <button
            (click)="confirmPickup()"
            class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
          >
            Confirm Pickup
          </button>
          }
        </div>
        } @case ('selecting_dropoff') {
        <div class="space-y-3">
          <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
            <div class="w-3 h-3 bg-green-500 rounded-full"></div>
            <span class="text-white"
              >{{ pickup()!.lat.toFixed(4) }}, {{ pickup()!.lon.toFixed(4) }}</span
            >
          </div>
          <div class="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
            <div class="w-3 h-3 bg-red-500 rounded-full"></div>
            <span class="text-slate-400 flex-1">
              @if (dropoff()) {
              {{ dropoff()!.lat.toFixed(4) }}, {{ dropoff()!.lon.toFixed(4) }}
              } @else { Select dropoff on map }
            </span>
            <button
              (click)="useCurrentLocation()"
              [disabled]="gettingLocation()"
              class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
            >
              @if (gettingLocation()) {
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              } @else {
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              } My Location
            </button>
          </div>
          @if (dropoff()) {
          <button
            (click)="requestRide()"
            class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
          >
            Request Ride
          </button>
          }
        </div>
        } @case ('matched') {
        <div class="space-y-4">
          <div
            class="flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl"
          >
            <div class="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                />
                <path
                  d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-2a4 4 0 00-4-4h-3V5a1 1 0 00-1-1H3z"
                />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-white font-semibold">Driver found!</h3>
              <p class="text-slate-400 text-sm">
                {{ matchedDriver()?.vehiclePlate || 'On the way' }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-white font-semibold">{{ matchedDriver()?.eta || 5 }} min</p>
              <p class="text-slate-400 text-xs">ETA</p>
            </div>
          </div>
        </div>
        } @case ('in_trip') {
        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl">
            <div>
              <p class="text-slate-400 text-sm">Trip in progress</p>
              <p class="text-white font-semibold">Heading to destination</p>
            </div>
            <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
        } }
      </div>
    </div>
  `,
})
export class RiderDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('map') mapComponent!: MapComponent;

  state = signal<RideState>('idle');
  pickup = signal<{ lat: number; lon: number } | null>(null);
  dropoff = signal<{ lat: number; lon: number } | null>(null);
  matchedDriver = signal<{ vehiclePlate?: string; eta?: number } | null>(null);
  gettingLocation = signal(false);

  private subscriptions: Subscription[] = [];

  constructor(
    private rideService: RideService,
    private wsService: WebSocketService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.wsService.connect();

    // Listen for ride accepted
    this.subscriptions.push(
      this.wsService.rideAccepted$.subscribe((data) => {
        this.matchedDriver.set({
          vehiclePlate: data.vehiclePlate,
          eta: data.eta,
        });
        this.state.set('matched');
      })
    );

    // Listen for trip updates
    this.subscriptions.push(
      this.wsService.tripUpdate$.subscribe((data) => {
        if (data.status === 'IN_PROGRESS') {
          this.state.set('in_trip');
        } else if (data.status === 'COMPLETED') {
          this.resetState();
        }
      })
    );

    // Listen for driver location updates
    this.subscriptions.push(
      this.wsService.locationUpdate$.subscribe((data) => {
        this.mapComponent?.updateDriverLocation(data.driverId, data.lat, data.lon);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.wsService.disconnect();
  }

  startBooking(): void {
    this.state.set('selecting_pickup');
  }

  onMapClick(event: MapClickEvent): void {
    if (this.state() === 'selecting_pickup') {
      this.pickup.set({ lat: event.lat, lon: event.lon });
      this.mapComponent.setMarker({
        id: 'pickup',
        lat: event.lat,
        lon: event.lon,
        type: 'pickup',
        label: 'Pickup',
      });
    } else if (this.state() === 'selecting_dropoff') {
      this.dropoff.set({ lat: event.lat, lon: event.lon });
      this.mapComponent.setMarker({
        id: 'dropoff',
        lat: event.lat,
        lon: event.lon,
        type: 'dropoff',
        label: 'Dropoff',
      });
    }
  }

  confirmPickup(): void {
    this.state.set('selecting_dropoff');
  }

  async useCurrentLocation(): Promise<void> {
    this.gettingLocation.set(true);
    try {
      const position = await this.mapComponent.getCurrentLocation();
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      // Set as pickup or dropoff based on current state
      if (this.state() === 'selecting_pickup') {
        this.pickup.set({ lat, lon });
        this.mapComponent.setMarker({
          id: 'pickup',
          lat,
          lon,
          type: 'pickup',
          label: 'Pickup',
        });
        this.mapComponent.panTo(lat, lon);
      } else if (this.state() === 'selecting_dropoff') {
        this.dropoff.set({ lat, lon });
        this.mapComponent.setMarker({
          id: 'dropoff',
          lat,
          lon,
          type: 'dropoff',
          label: 'Dropoff',
        });
        this.mapComponent.panTo(lat, lon);
      }
    } catch (error) {
      console.error('Failed to get current location:', error);
      alert(
        'Unable to get your location. Please enable location services or select manually on the map.'
      );
    } finally {
      this.gettingLocation.set(false);
    }
  }

  requestRide(): void {
    const pickup = this.pickup();
    const dropoff = this.dropoff();

    if (!pickup || !dropoff) return;

    this.state.set('searching');

    const request: RideRequest = {
      origin: { lat: pickup.lat, lon: pickup.lon },
      destination: { lat: dropoff.lat, lon: dropoff.lon },
    };

    this.rideService.requestRide(request).subscribe({
      next: (response) => {
        this.rideService.activeRide.set(response);
        // Will transition to 'matched' when WebSocket sends ride:accepted
      },
      error: (err) => {
        console.error('Failed to request ride:', err);
        this.state.set('idle');
      },
    });
  }

  cancelRequest(): void {
    const activeRide = this.rideService.activeRide();
    if (activeRide) {
      this.rideService.cancelRide(activeRide.id).subscribe();
    }
    this.resetState();
  }

  resetState(): void {
    this.state.set('idle');
    this.pickup.set(null);
    this.dropoff.set(null);
    this.matchedDriver.set(null);
    this.rideService.activeRide.set(null);
    this.mapComponent?.clearMarkers();
  }

  logout(): void {
    this.authService.logout();
  }
}
