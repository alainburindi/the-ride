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

```bash
cd infra/osrm

# Download Rwanda PBF from Geofabrik
wget https://download.geofabrik.de/africa/rwanda-latest.osm.pbf

# Preprocess with OSRM (MLD algorithm)
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/rwanda-latest.osm.pbf
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-partition /data/rwanda-latest.osrm
docker run --rm -v "$(pwd)":/data osrm/osrm-backend osrm-customize /data/rwanda-latest.osrm

# Rename for docker-compose
mv rwanda-latest.osrm rwanda.osrm
```

### 2. Start Services

```bash
# Start infrastructure (Redis, PostgreSQL, OSRM)
cd infra
docker compose up -d redis postgres osrm

# Install backend dependencies
cd ../apps/backend
yarn install

# Generate Prisma client & run migrations
yarn prisma generate
yarn prisma migrate dev

# Start backend
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

## Horizontal Scaling

The system is designed to support horizontal scaling with multiple backend instances:

### Redis-Based State Management

All transient state is stored in Redis instead of in-memory Maps, enabling multiple backend instances to share state:

| Component | Storage | Purpose |
|-----------|---------|---------|
| Pending ride requests | Redis Hash | Track active matching sessions |
| Driver socket mappings | Redis Hash | Map driverId to socketId across instances |
| Rider socket mappings | Redis Hash | Map riderId to socketId across instances |
| Driver locations | Redis GEO | Spatial queries for nearby drivers |
| Driver presence | Redis Keys + TTL | Online/offline status with auto-expiration |

### WebSocket Scaling with Redis Adapter

For WebSocket horizontal scaling, the system uses `@socket.io/redis-adapter`:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Backend 1  │     │  Backend 2  │     │  Backend 3  │
│  (Socket.io)│     │  (Socket.io)│     │  (Socket.io)│
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │    Redis    │
                    │  (Pub/Sub)  │
                    └─────────────┘
```

This allows:
- Any backend instance to send messages to any connected client
- Ride offers to reach drivers regardless of which instance they're connected to
- Seamless failover if an instance goes down

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

