# Deployment Checklist

## 1. Prepare environment

Copy `.env.example` to `.env` on the server and replace every `change-me-*` value.

Required production values:

- `NODE_ENV=production`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `BETTER_AUTH_BASE_URL`
- `BETTER_AUTH_SECRET`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MQTT_PASSWORD`
- `EMQX_DASHBOARD_PASSWORD`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_EXTERNAL_URL`
- `MEDIAMTX_WEBRTC_BASE_URL`

Keep `APP_PORT=3000` unless you also update `emqx/emqx.conf`, because EMQX calls the app internally at `http://app:3000/api/mqtt/auth`.

## 2. Start production stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production override exposes only:

- API: `APP_PORT`
- MQTT: `MQTT_PUBLIC_PORT`
- MediaMTX RTSP: `MEDIAMTX_RTSP_PORT`
- MediaMTX WebRTC: `MEDIAMTX_WEBRTC_PORT`

Database, Redis, Redpanda, Kafka UI, SeaweedFS internals, and EMQX dashboard are not published by the production override.

## 3. Verify

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -f http://localhost:${APP_PORT:-3000}/api/health
```

Then verify these flows from the frontend or an API client:

- Login/register and email verification
- MQTT device authentication
- Telemetry publish and dashboard updates
- File upload/download through S3
- Route planning with Mapbox token
- Live stream start/stop through MediaMTX

## 4. Before exposing to the internet

- Put a reverse proxy with TLS in front of the API and WebRTC endpoints.
- Do not expose Postgres, Redis, Redpanda, SeaweedFS, Kafka UI, or EMQX dashboard publicly.
- Back up Postgres volumes before replacing an existing server.
- Rotate any secret that has ever been committed, shared, or used locally.
