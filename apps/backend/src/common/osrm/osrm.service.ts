import {
  Injectable,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Coordinates {
  lon: number;
  lat: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSec: number;
}

export interface OsrmRouteResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    legs?: {
      distance: number;
      duration: number;
    }[];
  }[];
  message?: string;
}

@Injectable()
export class OsrmService {
  private readonly logger = new Logger(OsrmService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'OSRM_URL',
      'http://localhost:5000',
    );
  }

  /**
   * Convert coordinates array to OSRM path format: "lon,lat;lon,lat;..."
   */
  private toLonLatString(coords: Coordinates[]): string {
    return coords.map((c) => `${c.lon},${c.lat}`).join(';');
  }

  /**
   * Calculate route between two or more points
   * @param coords Array of coordinates [from, to] or [from, waypoint1, ..., to]
   * @returns Route distance in meters and duration in seconds
   */
  async getRoute(coords: Coordinates[]): Promise<RouteResult> {
    if (coords.length < 2) {
      throw new Error('At least 2 coordinates required for routing');
    }

    const path = this.toLonLatString(coords);
    const url = `${this.baseUrl}/route/v1/driving/${path}?overview=false&alternatives=false&steps=false`;

    const startTime = Date.now();

    try {
      const response = await fetch(url);
      const latency = Date.now() - startTime;

      this.logger.debug(`OSRM route request completed in ${latency}ms`);

      if (!response.ok) {
        this.logger.error(
          `OSRM route failed with status ${response.status}: ${response.statusText}`,
        );
        throw new ServiceUnavailableException(
          'OSRM routing service unavailable',
        );
      }

      const json: OsrmRouteResponse = await response.json();

      if (json.code !== 'Ok') {
        this.logger.warn(`OSRM returned code: ${json.code}, message: ${json.message}`);
        throw new ServiceUnavailableException(
          `OSRM routing failed: ${json.message || json.code}`,
        );
      }

      const route = json.routes?.[0];
      if (!route) {
        throw new ServiceUnavailableException('No route found');
      }

      return {
        distanceMeters: Math.round(route.distance),
        durationSec: Math.round(route.duration),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(`OSRM request failed: ${error}`);
      throw new ServiceUnavailableException(
        'OSRM routing service unavailable',
      );
    }
  }

  /**
   * Calculate pickup ETA: driver location → pickup location
   */
  async getPickupEta(
    driverLocation: Coordinates,
    pickupLocation: Coordinates,
  ): Promise<RouteResult> {
    return this.getRoute([driverLocation, pickupLocation]);
  }

  /**
   * Calculate trip ETA: pickup location → destination
   */
  async getTripEta(
    pickupLocation: Coordinates,
    destination: Coordinates,
  ): Promise<RouteResult> {
    return this.getRoute([pickupLocation, destination]);
  }

  /**
   * Calculate full route: driver → pickup → destination
   * Returns both pickup and trip segments
   */
  async getFullRouteEta(
    driverLocation: Coordinates,
    pickupLocation: Coordinates,
    destination: Coordinates,
  ): Promise<{
    pickup: RouteResult;
    trip: RouteResult;
  }> {
    // Make parallel requests for better performance
    const [pickup, trip] = await Promise.all([
      this.getPickupEta(driverLocation, pickupLocation),
      this.getTripEta(pickupLocation, destination),
    ]);

    return { pickup, trip };
  }

  /**
   * Health check for OSRM service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use a simple route in Kigali, Rwanda for health check
      const testCoords: Coordinates[] = [
        { lon: 30.0619, lat: -1.9444 }, // Kigali center
        { lon: 30.0650, lat: -1.9500 }, // Nearby point
      ];
      await this.getRoute(testCoords);
      return true;
    } catch {
      return false;
    }
  }
}

