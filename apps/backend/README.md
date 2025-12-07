# The RIDE - Backend

Ride-sharing backend service built with NestJS, using OSRM for routing and Redis GEO for driver location tracking.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Rwanda OSRM data (preprocessed)

## Quick Start

### 1. Prepare OSRM Data

```bash
cd infra/osrm

# Download Rwanda PBF
wget https://download.geofabrik.de/africa/rwanda-latest.osm.pbf

# Preprocess (run these commands one by one)
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/rwanda-latest.osm.pbf
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-partition /data/rwanda-latest.osrm
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-customize /data/rwanda-latest.osrm

# Rename for consistency
mv rwanda-latest.osrm rwanda.osrm
```

### 2. Start Infrastructure

```bash
cd infra
docker compose up -d redis postgres osrm
```

### 3. Install Dependencies & Run

```bash
cd apps/backend
yarn install

# Generate Prisma client
yarn prisma generate

# Run migrations
yarn prisma migrate dev

# Start development server
yarn start:dev
```

## API Endpoints

### Authentication

- `POST /auth/register` - Register new user (rider/driver)
- `POST /auth/login` - Login and get JWT token

### Drivers

- `GET /drivers` - List all drivers
- `GET /drivers/online` - List online drivers
- `GET /drivers/me` - Get current driver profile (drivers only)
- `GET /drivers/:id` - Get driver by ID
- `PATCH /drivers/:id` - Update driver profile
- `PATCH /drivers/:id/status` - Update driver status (online/offline/busy)

### Rides

- `POST /rides/request` - Create ride request (riders only)
- `GET /rides/requests` - Get user's ride requests
- `GET /rides/request/:id` - Get ride request details
- `DELETE /rides/request/:id` - Cancel ride request

### Trips

- `GET /trips` - Get user's trips
- `GET /trips/active` - Get current active trip
- `GET /trips/:id` - Get trip details
- `PATCH /trips/:id/state` - Update trip state

### Health

- `GET /health` - Full health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

## WebSocket Events

Connect to `ws://localhost:3001/ws?token=<JWT>`

### Driver Events

**Inbound:**
```json
{ "type": "driver.location", "driverId": "uuid", "lat": -1.9444, "lon": 30.0619, "ts": 1733558400000 }
{ "type": "driver.accept", "requestId": "uuid", "driverId": "uuid" }
{ "type": "driver.decline", "requestId": "uuid", "driverId": "uuid" }
```

**Outbound:**
```json
{ "type": "driver.offer", "requestId": "uuid", "origin": {...}, "destination": {...}, "pickupEtaSec": 180, "tripEtaSec": 600 }
```

### Rider Events

**Outbound:**
```json
{ "type": "rider.status", "requestId": "uuid", "status": "matching|matched|no_drivers", "tripId": "uuid", "pickupEtaSec": 180 }
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | REST API port | 3000 |
| WS_PORT | WebSocket port | 3001 |
| JWT_SECRET | JWT signing secret | dev_secret |
| JWT_EXPIRATION | Token expiration | 1h |
| REDIS_URL | Redis connection URL | redis://localhost:6379 |
| OSRM_URL | OSRM service URL | http://localhost:5050 |
| DATABASE_URL | PostgreSQL connection | postgres://user:pass@localhost:5432/ride |

## Example Flow

1. **Register a driver:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@test.com","password":"password123","role":"DRIVER","vehicleInfo":{"make":"Toyota","model":"Corolla"}}'
```

2. **Register a rider:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"rider@test.com","password":"password123","role":"RIDER"}'
```

3. **Driver goes online:**
```bash
curl -X PATCH http://localhost:3000/drivers/{driverId}/status \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"status":"ONLINE"}'
```

4. **Driver connects to WebSocket and sends location:**
```javascript
const ws = new WebSocket('ws://localhost:3001/ws?token={token}');
ws.send(JSON.stringify({
  type: 'driver.location',
  driverId: '{driverId}',
  lat: -1.9444,
  lon: 30.0619,
  ts: Date.now()
}));
```

5. **Rider requests a ride:**
```bash
curl -X POST http://localhost:3000/rides/request \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"origin":{"lat":-1.9444,"lon":30.0619},"destination":{"lat":-1.9530,"lon":30.0810}}'
```

6. **Driver receives offer via WebSocket and accepts**

7. **Trip is created and both parties are notified**

## License

MIT

