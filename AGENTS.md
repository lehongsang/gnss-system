## ROLE & CONTEXT
You are a senior backend engineer specializing in IoT systems, PostgreSQL, TimescaleDB, and PostGIS.
You are designing and implementing a database layer for a real-time GNSS tracking system.

---

## SYSTEM OVERVIEW
A fleet of hardware devices transmits GNSS telemetry data at 5-second intervals.
Each device sends: GPS coordinates (lat/lng/alt), satellite signal status, battery level, camera status.
The system must support: live tracking map, historical playback, geofence alerts, media review.

---

## DATABASE ARCHITECTURE

Use the following split architecture. Do NOT mix concerns across layers.

### Layer 1 — Static Identity (PostgreSQL)
Table: devices
- id (uuid, pk), name, mac_address (unique), owner_id (fk → users.id), created_at
- Store ONLY immutable or rarely-changing fields here.
- Do NOT store: battery_level, camera_status, gnss_status, status — these are dynamic.

Table: users
- id (uuid, pk), username (unique), password_hash, role (enum: admin, operator, viewer), created_at

---

### Layer 2 — Device Health State (PostgreSQL — 1 row per device)
Table: device_status
- device_id (uuid, pk, fk → devices.id)  ← 1-to-1, NOT a time-series
- status (varchar): 'online' | 'offline' | 'maintenance'
- battery_level (integer, 0–100)
- camera_status (boolean)
- gnss_status (boolean)
- updated_at (timestamp)

Implementation rule: always UPSERT, never INSERT.
```sql
INSERT INTO device_status (device_id, status, battery_level, camera_status, gnss_status, updated_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (device_id) DO UPDATE SET
  status = EXCLUDED.status,
  battery_level = EXCLUDED.battery_level,
  camera_status = EXCLUDED.camera_status,
  gnss_status = EXCLUDED.gnss_status,
  updated_at = now();
```
This table will always have exactly N rows = N devices, regardless of uptime duration.

---

### Layer 3 — High-frequency Telemetry (TimescaleDB + PostGIS)
Table: telemetry
- id (bigserial, pk)
- device_id (uuid, not null, fk → devices.id)
- timestamp (timestamptz, not null) ← partition key
- lat (double precision, not null)
- lng (double precision, not null)
- alt (double precision)
- accuracy_status (varchar): 'gnss_only' | 'vision_only' | 'fused'
- geom (geometry(Point, 4326)) ← PostGIS spatial index

Setup commands:
```sql
-- Convert to hypertable, partition by day
SELECT create_hypertable('telemetry', 'timestamp',
  chunk_time_interval => INTERVAL '1 day');

-- Compression: columnar storage, segment by device
ALTER TABLE telemetry SET (
  timescaledb.compress,
  timescaledb.compress_orderby    = 'timestamp DESC',
  timescaledb.compress_segmentby  = 'device_id'
);
SELECT add_compression_policy('telemetry', INTERVAL '7 days');

-- Retention: drop raw data older than 90 days
SELECT add_retention_policy('telemetry', INTERVAL '90 days');

-- Spatial index
CREATE INDEX ON telemetry USING GIST (geom);
CREATE INDEX ON telemetry (device_id, timestamp DESC);
```

---

### Layer 4 — Continuous Aggregates (TimescaleDB)
Create a 1-minute rollup for dashboard and playback queries:
```sql
CREATE MATERIALIZED VIEW telemetry_1min
WITH (timescaledb.continuous) AS
SELECT
  device_id,
  time_bucket('1 minute', timestamp) AS bucket,
  last(lat, timestamp)  AS lat,
  last(lng, timestamp)  AS lng,
  last(alt, timestamp)  AS alt,
  count(*)              AS sample_count
FROM telemetry
GROUP BY device_id, bucket;

SELECT add_continuous_aggregate_policy('telemetry_1min',
  start_offset => INTERVAL '2 hours',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
```

---

### Layer 5 — Geofencing (PostgreSQL + PostGIS)
Table: geofences
- id (uuid, pk), name (varchar), geom (geometry(Polygon, 4326), not null)
- created_by (uuid, fk → users.id), created_at

Table: device_geofence (junction, composite pk)
- device_id (uuid, fk → devices.id)
- geofence_id (uuid, fk → geofences.id)

Table: alerts
- id (uuid, pk), device_id (uuid, fk), alert_type (varchar), message (text)
- timestamp (timestamptz, default now())
- lat (double precision), lng (double precision)
- snapshot_url (varchar) ← S3 / MinIO object URL
- is_resolved (boolean, default false)

---

### Layer 6 — Media Metadata (PostgreSQL)
Table: media_logs
- id (uuid, pk), device_id (uuid, fk → devices.id)
- start_time (timestamptz), end_time (timestamptz)
- media_type (varchar): 'video_chunk' | 'image_frame'
- file_url (varchar, not null) ← S3 / MinIO path

---

## CODING REQUIREMENTS

Language/framework: [NESTJS]

Generate the following:
1. Migration SQL — all CREATE TABLE, CREATE INDEX, hypertable setup, continuous aggregate
2. Repository/service layer — typed functions for:
   - upsertDeviceStatus(deviceId, payload)
   - insertTelemetry(batch: TelemetryPoint[])   ← support batch insert for efficiency
   - getLatestPosition(deviceId)
   - getTrackHistory(deviceId, from: Date, to: Date)  ← query telemetry_1min for long ranges
   - checkGeofenceViolation(deviceId, lat, lng)        ← ST_Within or ST_DWithin
3. Validation — reject any incoming payload where:
   - lat outside [-90, 90] or lng outside [-180, 180]
   - battery_level outside [0, 100]
   - device_id does not exist in devices table

## CONSTRAINTS
- Never write battery_level or camera_status into the telemetry table
- Always use parameterized queries (no string interpolation)
- Batch telemetry inserts using unnest() or COPY for throughput at 5s intervals
- geom column must be auto-populated from lat/lng:
  ST_SetSRID(ST_MakePoint(lng, lat), 4326)
