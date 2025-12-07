# The RIDE — Ride-Sharing System

A minimal ride-sharing backend implementation focusing on the critical flow:
**Driver onboarding → Ride request → Nearby matching → Driver accepts → Trip created**

Built with **OSRM** for routing/ETA using **Rwanda** map data.

## Architecture

```
Customer/Driver (Angular)     [Future]
        |
    REST + WebSocket
        v
Node.js Backend (NestJS)
├── Auth (JWT)
├── Drivers (CRUD, Status)
├── Locations (Redis GEO)
├── Matching (OSRM scoring)
├── Trips (State machine)
└── Rides (Request orchestration)
        |
Redis (GEO) ---- OSRM (Rwanda routes/ETA)
        |
PostgreSQL + PostGIS (persistence)
```

## Project Structure

```
the-ride/
├── apps/
│   └── backend/           # NestJS backend
│       ├── src/
│       │   ├── modules/   # Feature modules
│       │   ├── ws/        # WebSocket gateway
│       │   ├── common/    # Shared services
│       │   └── health/    # Health checks
│       ├── prisma/        # Database schema
│       └── Dockerfile
├── infra/
│   ├── docker-compose.yml
│   └── osrm/              # Rwanda OSRM data
└── README.md
```

## Quick Start

### 1. Prepare OSRM Data

> **Note:** This is a one-time setup step. OSRM map processing is CPU-intensive and takes 10-30 minutes, which is why it's done separately rather than in Docker startup.

```bash
cd infra/osrm

# Download Rwanda PBF from Geofabrik
wget https://download.geofabrik.de/africa/rwanda-latest.osm.pbf
# Or use curl if wget is not installed:
# curl -L -o rwanda-latest.osm.pbf https://download.geofabrik.de/africa/rwanda-latest.osm.pbf

# Preprocess with OSRM (MLD algorithm)
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/rwanda-latest.osm.pbf
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-partition /data/rwanda-latest.osrm
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-customize /data/rwanda-latest.osrm

```

### 2. Start Services

#### Option A: Run Everything in Docker (Recommended for Production)

```bash
cd infra
docker compose up -d
```

This will start all services:
- **PostgreSQL** - Database with PostGIS extension
- **Redis** - For GEO queries and caching
- **OSRM** - Route calculation engine
- **Backend** - NestJS API (auto-runs migrations on startup)

#### Option B: Development Mode (Local Backend)

```bash
# Start infrastructure only
cd infra
docker compose up -d redis postgres osrm

# Install backend dependencies
cd ../apps/backend
yarn install

# Generate Prisma client & run migrations
yarn prisma generate
yarn prisma migrate dev

# Seed database with test data (optional)
yarn prisma db seed

# Start backend in dev mode
yarn start:dev
```

### 3. Test the Flow

See `apps/backend/README.md` for detailed API documentation and example requests.

## Key Features

- **JWT Authentication** for riders and drivers
- **Redis GEO** for real-time driver location tracking
- **OSRM Integration** for accurate pickup and trip ETAs
- **WebSocket** for real-time communication
- **PostgreSQL + PostGIS** for trip persistence

## Scaling Considerations

### Current State (Single Instance)

Since this is a **prototype/test project**, the current implementation is designed for **single-instance deployment**. Some state is intentionally stored in-memory for simplicity:

| Component | Current Storage | Notes |
|-----------|-----------------|-------|
| Pending ride requests | In-memory Map | Lost on restart |
| Driver socket mappings | In-memory Map | Instance-specific |
| Rider socket mappings | In-memory Map | Instance-specific |
| Driver locations | **Redis GEO** ✅ | Shared across instances |
| Driver presence | **Redis Keys + TTL** ✅ | Shared across instances |

### Future: Horizontal Scaling

To support multiple backend instances, these changes would be needed:

**1. Move pending requests to Redis:**
```typescript
// Instead of: private pendingRequests = new Map()
// Use: Redis Hash for pending request state
await redis.hset('pending:requests', requestId, JSON.stringify(pendingRequest));
```

**2. Add Socket.io Redis Adapter:**
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
io.adapter(createAdapter(pubClient, subClient));
```

**3. Store socket mappings in Redis:**
```typescript
// Map driverId -> socketId in Redis instead of in-memory
await redis.hset('sockets:drivers', driverId, socketId);
```

This would enable:
- Any backend instance to send messages to any connected client
- Ride offers to reach drivers regardless of which instance they're connected to
- State persistence across restarts

### Future Scaling Options

For millions of location updates per second, consider:
- **Redis Cluster**: Horizontal partitioning of geo data
- **Message Queue (Kafka/RabbitMQ)**: Async location processing pipeline
- **Geohashing (H3/S2)**: Hierarchical spatial indexing

### Future Resilience: Circuit Breaker for OSRM

The OSRM service is critical for ETA calculations. To improve resilience, implement a circuit breaker pattern:

```
CLOSED (normal) ──[failures exceed threshold]──► OPEN (fail fast)
                                                      │
                                                [timeout]
                                                      ▼
                                              HALF-OPEN (test)
                                                      │
                                    success → CLOSED, failure → OPEN
```

Benefits:
- **Fail fast**: Don't wait for OSRM timeout when service is down
- **Graceful degradation**: Return cached ETAs or estimates
- **Auto-recovery**: Automatically retry when OSRM recovers
- **Resource protection**: Prevent cascading failures

Implementation options: Custom lightweight implementation or `opossum` library.

## Acceptance Criteria

- ✅ Driver onboarding works via REST
- ✅ Driver WS location updates update Redis GEO and presence TTL
- ✅ Ride request triggers Redis nearby search, OSRM pickup & trip ETA, sends WS offer
- ✅ Driver accepts, trip created and ETA returned from OSRM

## Performance Target

Nearby lookup + 3–5 OSRM calls **< 400 ms** on a laptop.

## License

MIT

