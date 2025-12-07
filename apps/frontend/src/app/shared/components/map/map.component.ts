import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  type: 'pickup' | 'dropoff' | 'driver' | 'rider';
  label?: string;
}

export interface MapClickEvent {
  lat: number;
  lon: number;
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: ` <div #mapContainer class="w-full h-full rounded-xl overflow-hidden"></div> `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  @Input() center: [number, number] = [-1.9403, 29.8739]; // Kigali default
  @Input() zoom = 13;
  @Input() clickable = false;

  @Output() mapClick = new EventEmitter<MapClickEvent>();

  private map!: L.Map;
  private markers = new Map<string, L.Marker>();
  private routeLayer: L.Polyline | null = null;

  // Custom icons
  private icons = {
    pickup: L.divIcon({
      className: 'custom-marker',
      html: `<div class="w-8 h-8 bg-green-500 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    }),
    dropoff: L.divIcon({
      className: 'custom-marker',
      html: `<div class="w-8 h-8 bg-red-500 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    }),
    driver: L.divIcon({
      className: 'custom-marker',
      html: `<div class="w-10 h-10 bg-indigo-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
          <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-2a4 4 0 00-4-4h-3V5a1 1 0 00-1-1H3z"/>
        </svg>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    }),
    rider: L.divIcon({
      className: 'custom-marker',
      html: `<div class="w-8 h-8 bg-amber-500 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    }),
  };

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: this.center,
      zoom: this.zoom,
      zoomControl: false,
    });

    // Dark theme tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(this.map);

    // Add zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    if (this.clickable) {
      this.map.on('click', (e: L.LeafletMouseEvent) => {
        this.mapClick.emit({ lat: e.latlng.lat, lon: e.latlng.lng });
      });
    }
  }

  setMarker(marker: MapMarker): void {
    // Remove existing marker with same ID
    if (this.markers.has(marker.id)) {
      this.markers.get(marker.id)!.remove();
    }

    const icon = this.icons[marker.type];
    const leafletMarker = L.marker([marker.lat, marker.lon], { icon }).addTo(this.map);

    if (marker.label) {
      leafletMarker.bindPopup(marker.label);
    }

    this.markers.set(marker.id, leafletMarker);
  }

  removeMarker(id: string): void {
    if (this.markers.has(id)) {
      this.markers.get(id)!.remove();
      this.markers.delete(id);
    }
  }

  clearMarkers(): void {
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
  }

  updateDriverLocation(id: string, lat: number, lon: number): void {
    if (this.markers.has(id)) {
      this.markers.get(id)!.setLatLng([lat, lon]);
    } else {
      this.setMarker({ id, lat, lon, type: 'driver' });
    }
  }

  drawRoute(coordinates: [number, number][]): void {
    this.clearRoute();

    this.routeLayer = L.polyline(coordinates, {
      color: '#6366f1',
      weight: 4,
      opacity: 0.8,
    }).addTo(this.map);

    this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });
  }

  clearRoute(): void {
    if (this.routeLayer) {
      this.routeLayer.remove();
      this.routeLayer = null;
    }
  }

  fitBounds(bounds: L.LatLngBoundsExpression): void {
    this.map.fitBounds(bounds, { padding: [50, 50] });
  }

  panTo(lat: number, lon: number): void {
    this.map.panTo([lat, lon]);
  }

  getCurrentLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
    });
  }
}
