# GNSS System Backend

NestJS backend for a GNSS tracking system with authentication, telemetry ingestion, alerts, storage, route planning, MQTT integration, Kafka/Redpanda messaging, and MediaMTX live stream support.

## Documentation

- [Storage & Media](docs/STORAGE.md)
- [Kafka Messaging](docs/KAFKA.md)
- [MQTT](docs/MQTT.md)
- [Authentication](docs/AUTH.md)
- [Exception Handling](docs/EXCEPTIONS.md)
- [Frontend Route Planning Guide](docs/FE_ROUTE_PLANNING_GUIDE.md)
- [Deployment](docs/DEPLOYMENT.md)

## Tech Stack

- NestJS 11, TypeScript
- PostgreSQL/PostGIS, TypeORM
- Redis
- Redpanda Kafka
- SeaweedFS S3-compatible storage
- EMQX MQTT broker
- MediaMTX
- Better Auth

## Local Setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

## Docker

Development/full stack:

```bash
docker compose up -d --build
```

Production stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The API is available at `http://localhost:3000` by default.

## Scripts

```bash
npm run build
npm test
npm run test:e2e
npm run migration:run
```

Swagger is available at `/api/docs` outside production by default. Set `SWAGGER_ENABLED=true` to enable it explicitly.
