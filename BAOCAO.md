# 📋 BÁO CÁO TỔNG QUAN DỰ ÁN — GNSS SYSTEM BACKEND

> **Ngày tạo:** 22/04/2026
> **Trạng thái lint:** ✅ Passed (0 errors)
> **Stack chính:** NestJS + TypeORM + PostgreSQL/PostGIS + Kafka (Redpanda) + MQTT (EMQX) + Redis + SeaweedFS (S3) + Socket.IO

---

## MỤC LỤC

1. [Kiến trúc tổng quan](#1-kiến-trúc-tổng-quan)
2. [Cơ sở dữ liệu (Database)](#2-cơ-sở-dữ-liệu-database)
3. [Các chức năng đã có](#3-các-chức-năng-đã-có)
4. [Đánh giá & Nhận xét từng module](#4-đánh-giá--nhận-xét-từng-module)
5. [Tổng hợp: Cần sửa vs Cần mở rộng](#5-tổng-hợp-cần-sửa-vs-cần-mở-rộng)

---

## 1. Kiến trúc tổng quan

### Luồng dữ liệu chính

```
GNSS Device ──MQTT──► EMQX Broker ──► MqttService (NestJS)
                                         │
                        ┌────────────────┤
                        ▼                ▼                ▼
                   Kafka Topic:     Kafka Topic:     Kafka Topic:
                gnss.coordinates  gnss.alerts     gnss.media.upload
                        │                │                │
                        ▼                ▼                ▼
              TelemetryConsumer  AlertsConsumer   (Chưa implement)
                   │    │            │   │
                   │    │            │   │
                   ▼    ▼            ▼   ▼
               DB Save  WS       DB Save  WS + Email
```

### Stack hạ tầng (Docker Compose)

| Service              | Image                      | Port       | Vai trò                    |
|----------------------|----------------------------|------------|----------------------------|
| PostgreSQL + PostGIS | `postgres:18`              | 5432       | Database chính             |
| Redis                | `redis:8-alpine`           | 6379       | Cache, Rate limit, Cooldown|
| Redpanda (Kafka)     | `redpanda:v23.2.1`         | 9092/29092 | Message broker             |
| EMQX                 | `emqx:5.8`                 | 1883/18083 | MQTT Broker                |
| SeaweedFS            | `seaweedfs:3.59`           | 8333       | Object Storage (S3-compat) |
| OpenSearch           | `opensearch:2.11.0`        | 9200       | Log indexing & search      |
| Fluent Bit (x2)      | `fluent-bit:latest`        | —          | Log shipper & indexer      |
| Kafka UI             | `kafka-ui:latest`          | 8088       | Kafka monitoring           |

---

## 2. Cơ sở dữ liệu (Database)

### 2.1 Tổng quan các bảng

Dự án hiện có **14 bảng** (13 entity files + 1 bảng trung gian `device_geofence`).

### 2.2 Phân loại bảng

#### 🔵 Bảng TĨNH (Cấu hình / Master data — ít thay đổi sau khi tạo)

| # | Bảng       | Entity       | File        | Mô tả                                |
|---|------------|--------------|-------------|---------------------------------------|
| 1 | `user`     | `User`       | `auth/entities/user.entity.ts` | Thông tin người dùng                |
| 2 | `account`  | `Account`    | `auth/entities/account.entity.ts` | OAuth provider (Google, GitHub...) |
| 3 | `jwks`     | `Jwks`       | `auth/entities/jwks.entity.ts` | Signing keys cho JWT              |
| 4 | `twoFactor`| `TwoFactor`  | `auth/entities/two-factor.entity.ts` | Cấu hình 2FA                 |
| 5 | `devices`  | `Device`     | `devices/entities/device.entity.ts` | Thông tin thiết bị GNSS        |
| 6 | `geofences`| `Geofence`   | `geofences/entities/geofence.entity.ts` | Vùng địa lý (PostGIS Polygon)|
| 7 | `medias`   | `Media`      | `services/storage/entities/media.entity.ts` | Metadata file upload     |

#### 🔴 Bảng ĐỘNG (Time-series / Log — insert liên tục, volume lớn)

| # | Bảng             | Entity         | File           | Mô tả                                       | Tần suất ghi          |
|---|------------------|----------------|----------------|----------------------------------------------|-----------------------|
| 1 | `telemetry`      | `Telemetry`    | `telemetry/entities/telemetry.entity.ts` | Dữ liệu GPS (lat, lng, speed, heading...) | **Rất cao** (1-5s/point) |
| 2 | `alerts`         | `Alert`        | `alerts/entities/alert.entity.ts` | Cảnh báo thiết bị (geofence, speed...) | Trung bình           |
| 3 | `media_logs`     | `MediaLog`     | `media-logs/entities/media-log.entity.ts` | Log video/ảnh từ camera thiết bị    | Trung bình           |
| 4 | `device_status`  | `DeviceStatus` | `device-status/entities/device-status.entity.ts` | Trạng thái heartbeat (upsert) | Cao (mỗi 10-30s)    |

#### 🟡 Bảng PHIÊN (Session — tự động hết hạn / xoay vòng)

| # | Bảng           | Entity         | File           | Mô tả                                      |
|---|----------------|----------------|----------------|---------------------------------------------|
| 1 | `session`      | `Session`      | `auth/entities/session.entity.ts` | Phiên đăng nhập (token, IP, UA)    |
| 2 | `verification` | `Verification` | `auth/entities/verification.entity.ts` | OTP / mã xác thực (TTL)       |

#### 🟢 Bảng TRUNG GIAN (Join table)

| # | Bảng              | Quan hệ              | Mô tả                              |
|---|--------------------|----------------------|-------------------------------------|
| 1 | `device_geofence`  | Geofence ↔ Device    | Many-to-Many: thiết bị nào thuộc vùng nào |

---

### 2.3 Rà soát Entity — Chi tiết vấn đề

#### `BaseEntity` (`src/commons/entities/base.entity.ts`)

| Trường      | Kiểu             | Có     | Nhận xét                                        |
|-------------|-------------------|--------|--------------------------------------------------|
| `id`        | `uuid` (UUIDv7)   | ✅     | PK, auto-generate bằng `@BeforeInsert()`         |
| `createdAt` | `timestamp`        | ✅     | Mặc định `CURRENT_TIMESTAMP`                     |
| `updatedAt` | `@UpdateDateColumn`| ✅     | Tự động cập nhật khi entity thay đổi             |
| `deletedAt` | —                  | ❌     | Không có trong Base — khai báo riêng ở entity cần soft delete |

> ✅ **Đã sửa:** `BaseEntity` cung cấp `id`, `createdAt`, `updatedAt` cho tất cả entity con. Các entity GNSS domain cần soft delete sẽ tự khai báo `deletedAt` với `@DeleteDateColumn`. Entity Auth (BetterAuth quản lý) kế thừa trực tiếp mà không cần thêm trường.

#### Entity Authentication (BetterAuth quản lý)

| Entity         | Extends BaseEntity | updatedAt | deletedAt | class-validator | Nhận xét                          |
|----------------|-------------------|-----------|-----------|-----------------|-----------------------------------|
| `User`         | ✅                 | ✅ (Base) | ❌        | ✅              | BetterAuth quản lý — OK không cần soft delete |
| `Account`      | ✅                 | ✅ (Base) | ❌        | ❌              | **Thiếu validator** — Nhưng BetterAuth tự quản lý nên không critical |
| `Session`      | ✅                 | ✅ (Base) | ❌        | ❌              | BetterAuth quản lý — OK            |
| `Jwks`         | ✅                 | ✅ (Base) | ❌        | ❌              | BetterAuth quản lý — OK            |
| `TwoFactor`    | ✅                 | ✅ (Base) | ❌        | ❌              | BetterAuth quản lý — OK            |
| `Verification` | ✅                 | ✅ (Base) | ❌        | ❌              | BetterAuth quản lý — OK            |

#### Entity GNSS Domain

| Entity         | Extends BaseEntity | updatedAt | deletedAt | class-validator | Index | Nhận xét                          |
|----------------|-------------------|-----------|-----------|-----------------|-------|-----------------------------------|
| `Device`       | ✅                 | ✅ (Base) | ✅        | ✅              | —     | ✅ Đầy đủ, có `speedLimitKmh`     |
| `DeviceStatus` | ❌ (PK = deviceId) | ✅        | ❌        | ✅              | —     | ✅ **Thiết kế đúng** — 1:1 natural PK, không cần soft delete |
| `Telemetry`    | ✅                 | ✅ (Base) | ✅        | ✅              | ✅ `[deviceId, timestamp]` | ✅ Tốt. Có PostGIS `geom` column |
| `Alert`        | ✅                 | ✅ (Base) | ✅        | ✅              | ✅ `[deviceId, createdAt]` | ✅ Đầy đủ                     |
| `Geofence`     | ✅                 | ✅ (Base) | ✅        | ✅ (partial)    | —     | ⚠️ **Thiếu index** — Cần GiST index trên `geom` cho PostGIS |
| `MediaLog`     | ✅                 | ✅ (Base) | ✅        | ✅              | ✅ `[deviceId, startTime]` | ✅ Đầy đủ, có `s3Key` cho presigned URL |
| `Media`        | ✅                 | ✅ (Base) | ✅        | ✅              | —     | ✅ **Đã sửa** — Thêm `deletedAt` + `class-validator` + `@ApiProperty` |

---

### 2.4 Sơ đồ quan hệ (ERD)

```mermaid
erDiagram
    USER ||--o{ ACCOUNT : "has"
    USER ||--o{ SESSION : "has"
    USER ||--o{ DEVICE : "owns"
    USER ||--o{ GEOFENCE : "creates"
    DEVICE ||--|| DEVICE_STATUS : "has"
    DEVICE ||--o{ TELEMETRY : "generates"
    DEVICE ||--o{ ALERT : "triggers"
    DEVICE ||--o{ MEDIA_LOG : "produces"
    DEVICE }o--o{ GEOFENCE : "assigned to"
    USER ||--o| MEDIA : "avatar"

    USER {
        uuid id PK
        varchar name
        varchar email UK
        varchar phoneNumber UK
        enum role
        boolean emailVerified
        uuid mediaId FK
    }

    DEVICE {
        uuid id PK
        varchar name
        varchar macAddress UK
        uuid ownerId FK
        float speedLimitKmh
    }

    TELEMETRY {
        uuid id PK
        uuid deviceId FK
        float lat
        float lng
        float speed
        float heading
        float altitude
        timestamp timestamp
        enum accuracyStatus
    }

    ALERT {
        uuid id PK
        uuid deviceId FK
        enum alertType
        text message
        float lat
        float lng
        boolean isResolved
    }

    GEOFENCE {
        uuid id PK
        varchar name
        uuid createdBy FK
        geometry geom
    }

    DEVICE_STATUS {
        uuid deviceId PK_FK
        enum status
        int batteryLevel
        boolean cameraStatus
        boolean gnssStatus
    }

    MEDIA_LOG {
        uuid id PK
        uuid deviceId FK
        timestamp startTime
        timestamp endTime
        enum mediaType
        varchar s3Key
    }
```

---

## 3. Các chức năng đã có

### 3.1 Module Authentication & Authorization

| Chức năng                          | Trạng thái | Ghi chú                                           |
|-------------------------------------|-----------|-----------------------------------------------------|
| Đăng ký / Đăng nhập (email+pass)   | ✅ Hoàn thiện | BetterAuth quản lý, có email verification         |
| OAuth (Google, GitHub...)           | ✅ Hoàn thiện | Thông qua `Account` entity                        |
| JWT / Session management            | ✅ Hoàn thiện | `Session` entity, auto-refresh                     |
| 2FA (TOTP)                          | ✅ Hoàn thiện | `TwoFactor` entity, backup codes                   |
| RBAC (Role-based access control)    | ✅ Hoàn thiện | `@Roles()` decorator, `AuthGuard` global           |
| Rate Limiting                       | ✅ Hoàn thiện | `CustomRateLimitGuard`, `@RateLimit()` decorator   |
| Admin auto-sync on startup          | ✅ Hoàn thiện | `UsersService.onModuleInit()` → `syncAdmin()`      |

### 3.2 Module Users

| Chức năng                 | Endpoint           | Trạng thái | Ghi chú                             |
|---------------------------|---------------------|-----------|---------------------------------------|
| Xem profile cá nhân       | `GET /users/me`     | ✅         | Có presigned URL cho avatar           |
| Cập nhật profile + avatar  | `PATCH /users/me`   | ✅         | Upload ảnh → WebP conversion → S3    |

### 3.3 Module Devices

| Chức năng                 | Endpoint              | Trạng thái | Ghi chú                           |
|---------------------------|-----------------------|-----------|-------------------------------------|
| Lấy tất cả thiết bị       | `GET /devices`        | ✅ Admin   | Phân trang, search by name          |
| Lấy thiết bị của tôi      | `GET /devices/mine`   | ✅ All     | Filter theo `ownerId`              |
| Xem chi tiết thiết bị     | `GET /devices/:id`    | ✅ All     | Ownership check                    |
| Thêm thiết bị             | `POST /devices`       | ✅ All     | MAC address unique                 |
| Cập nhật thiết bị         | `PATCH /devices/:id`  | ✅ All     | Bao gồm `speedLimitKmh`           |
| Xoá thiết bị              | `DELETE /devices/:id` | ✅ All     | Hard delete (không soft delete)    |

### 3.4 Module Device Status

| Chức năng                   | Endpoint / Consumer             | Trạng thái | Ghi chú                          |
|-----------------------------|---------------------------------|-----------|-------------------------------------|
| Xem status thiết bị          | `GET /devices/:id/status`      | ✅         | Auto-create default nếu chưa có  |
| Nhận heartbeat qua Kafka     | `DeviceStatusConsumer`         | ✅         | Upsert + WebSocket broadcast      |

### 3.5 Module Telemetry

| Chức năng                     | Endpoint / Consumer             | Trạng thái | Ghi chú                          |
|-------------------------------|---------------------------------|-----------|-------------------------------------|
| Lịch sử GPS                   | `GET /telemetry/:deviceId/history` | ✅     | Filter theo `from`/`to`, phân trang |
| GPS point mới nhất             | `GET /telemetry/:deviceId/latest`  | ✅     | Ownership check                    |
| Tìm điểm lân cận (nearby)     | `GET /telemetry/nearby`            | ✅ Admin | PostGIS `ST_DWithin`              |
| Kafka consumer lưu GPS        | `TelemetryConsumer`                | ✅     | Save → PostGIS geom → WS broadcast |
| Phát hiện vượt tốc server-side | `TelemetryConsumer.checkSpeedViolation` | ✅ | Redis cooldown 60s anti-spam   |

### 3.6 Module Geofences

| Chức năng                 | Endpoint                              | Trạng thái | Ghi chú                          |
|---------------------------|---------------------------------------|-----------|-------------------------------------|
| Lấy tất cả geofences      | `GET /geofences`                      | ✅ Admin   | ST_AsGeoJSON cho geom             |
| Lấy geofences của tôi     | `GET /geofences/mine`                 | ✅ All     | Filter theo `createdBy`           |
| Xem chi tiết geofence     | `GET /geofences/:id`                  | ✅ All     | Parse PostGIS geometry            |
| Tạo geofence              | `POST /geofences`                     | ✅ All     | GeoJSON → ST_GeomFromGeoJSON      |
| Cập nhật geofence         | `PATCH /geofences/:id`                | ✅ All     | Cập nhật tên + geom               |
| Xoá geofence              | `DELETE /geofences/:id`               | ✅ All     | Hard delete                       |
| Gán thiết bị vào geofence  | `POST /geofences/:id/devices`        | ✅ All     | Many-to-Many relationship          |
| Gỡ thiết bị khỏi geofence  | `DELETE /geofences/:id/devices/:did`  | ✅ All     |                                    |
| Kiểm tra vi phạm geofence  | `geofencesService.getViolatedGeofences()` | ✅ Internal | PostGIS `ST_Within` check   |

### 3.7 Module Alerts

| Chức năng                  | Endpoint / Consumer            | Trạng thái | Ghi chú                         |
|----------------------------|---------------------------------|-----------|-----------------------------------|
| Lấy tất cả alerts          | `GET /alerts`                   | ✅ Admin   | Phân trang, filter               |
| Lấy alerts của tôi          | `GET /alerts/mine`              | ✅ All     | INNER JOIN device ownership      |
| Xem chi tiết alert          | `GET /alerts/:id`               | ✅ All     | Ownership check                  |
| Đánh dấu đã xử lý          | `PATCH /alerts/:id/resolve`     | ✅ All     |                                  |
| Nhận alert qua Kafka        | `AlertsConsumer`                | ✅         | Save → WS broadcast → Email     |
| Gửi email cảnh báo nghiêm trọng | `AlertsConsumer` → `MailService` | ✅     | GEOFENCE_EXIT, SIGNAL_LOST, OBSTACLE |

### 3.8 Module Media Logs

| Chức năng                 | Endpoint                           | Trạng thái | Ghi chú                         |
|---------------------------|------------------------------------|-----------|-----------------------------------|
| Lấy tất cả media logs     | `GET /media-logs`                  | ✅ Admin   | Phân trang, filter               |
| Lấy media logs của tôi    | `GET /media-logs/mine`             | ✅ All     | INNER JOIN device ownership      |
| Xem chi tiết media log    | `GET /media-logs/:id`              | ✅ All     |                                  |
| Lấy presigned stream URL  | `GET /media-logs/:id/stream`       | ✅ All     | S3 presigned URL (1h TTL)        |

### 3.9 WebSocket Gateway (Realtime)

| Chức năng                          | Event                   | Trạng thái | Ghi chú                        |
|------------------------------------|-------------------------|-----------|----------------------------------|
| Subscribe theo dõi device          | `subscribe:device`       | ✅         | Join room `device:{id}`         |
| Unsubscribe                        | `unsubscribe:device`     | ✅         | Leave room                      |
| Join user room (nhận alert)        | `join:user`              | ✅         | Join room `user:{id}`           |
| Broadcast GPS update               | `telemetry:update`       | ✅         | Từ TelemetryConsumer            |
| Broadcast alert                    | `alert:new`              | ✅         | Từ AlertsConsumer               |
| Broadcast device status            | `device-status:update`   | ✅         | Từ DeviceStatusConsumer         |

### 3.10 Infrastructure Services

| Service          | Trạng thái | Chức năng chính                                       |
|------------------|-----------|--------------------------------------------------------|
| `KafkaService`   | ✅         | Producer/Consumer wrapper cho Redpanda                 |
| `MailService`    | ✅         | Gửi OTP, Email verification, Password reset, Alert email |
| `StorageService` | ✅         | Upload/Delete S3, Presigned URL, Image processing (Sharp→WebP) |
| `RedisService`   | ✅         | Cache, Pub/Sub, TTL key, Distributed lock              |
| `MqttService`    | ✅         | Bridge MQTT → Kafka (coordinates, alerts, media)       |
| `SearchService`  | ⚠️ Có module | OpenSearch — chưa thấy sử dụng rõ ràng trong business logic |

### 3.11 Hệ thống phụ trợ

| Chức năng             | Trạng thái | Ghi chú                                          |
|-----------------------|-----------|------------------------------------------------------|
| Health Check          | ✅         | `GET /health` — Terminus integration                |
| Global Exception Filters | ✅     | 4 filter layers (Custom, Http, BetterAuth, All)      |
| Swagger API Docs      | ✅         | `@Doc()` decorator, `@ApiTags()`                    |
| Centralized Logging   | ✅         | Fluent Bit → Redpanda → OpenSearch → Dashboards     |
| Rate Limiting         | ✅         | Redis-backed, `@RateLimit()` decorator              |

---

## 4. Đánh giá & Nhận xét từng module

### 4.1 Auth Module — ✅ Ổn định

- BetterAuth xử lý toàn bộ auth flow, không cần can thiệp.
- Entity auth không cần `class-validator` vì BetterAuth quản lý nội bộ.
- **Không cần sửa.**

### 4.2 Users Module — ✅ Ổn định, cần mở rộng nhẹ

- Profile + Avatar upload hoạt động tốt.
- **Cần mở rộng:**
  - ❓ Thiếu API admin quản lý users (list, ban/unban, change role).
  - ❓ Chưa có endpoint xoá tài khoản (GDPR compliance).

### 4.3 Devices Module — ⚠️ Cần sửa nhẹ

- CRUD đầy đủ, ownership check tốt.
- **Cần sửa:**
  - ⚠️ `remove()` dùng **hard delete** (`deviceRepository.remove()`) thay vì soft delete. Entity đã có `deletedAt` column nhưng không sử dụng.
  - ⚠️ Khi xoá device, các bản ghi `telemetry`, `alerts`, `media_logs` sẽ bị CASCADE xoá cứng — **mất dữ liệu lịch sử**.

### 4.4 Device Status Module — ✅ Ổn định

- Upsert pattern đúng (1 device = 1 status row).
- Kafka consumer + WebSocket broadcast hoạt động.
- **Không cần sửa.**

### 4.5 Telemetry Module — ✅ Tốt, cần mở rộng

- Kafka consumer save + broadcast + speed check đầy đủ.
- PostGIS `geom` column cho spatial query.
- **Cần mở rộng:**
  - ❓ Chưa có **geofence check** trong TelemetryConsumer — `getViolatedGeofences()` đã implement ở GeofenceService nhưng chưa được gọi khi nhận GPS point mới.
  - ❓ Chưa có tính năng **trajectory deviation detection**.
  - ❓ Telemetry volume sẽ rất lớn — cần chiến lược **partitioning/archiving** (TimescaleDB hoặc table partitioning).

### 4.6 Geofences Module — ⚠️ Cần sửa + mở rộng

- CRUD + PostGIS geometry hoạt động.
- **Cần sửa:**
  - ⚠️ `findAll()` dùng `ST_AsGeoJSON(geofence.geom) as geom` trong `.select()` nhưng đây là string trong `select` array, **TypeORM sẽ không xử lý đúng** — cần dùng `.addSelect('ST_AsGeoJSON(geofence.geom)', 'geom')` và `getRawAndEntities()`.
  - ⚠️ `remove()` dùng **hard delete** — Entity đã có `deletedAt` nhưng không sử dụng.
  - ⚠️ **Thiếu GiST index** trên cột `geom` — sẽ rất chậm khi query `ST_Within` trên dataset lớn.
- **Cần mở rộng:**
  - ❓ Chưa tích hợp realtime geofence check vào pipeline Telemetry.

### 4.7 Alerts Module — ✅ Tốt, cần mở rộng

- Kafka consumer → DB → WebSocket → Email pipeline đầy đủ.
- Anti-spam cooldown cho SPEEDING alerts.
- **Cần mở rộng:**
  - ❓ Chưa có module **Notifications** (in-app notification inbox) — kế hoạch trong `EXPAND.md` nhưng chưa implement.
  - ❓ Chưa có **alert statistics / dashboard API** (đếm theo type, chart theo thời gian).

### 4.8 Media Logs Module — ⚠️ Cần sửa + mở rộng

- Presigned URL streaming hoạt động.
- **Cần sửa:**
  - ⚠️ Chỉ có **read APIs** — thiếu hoàn toàn phần **ingest** (Kafka consumer cho `gnss.media.upload` topic). MediaLog chỉ có thể tạo thông qua `mediaLogsService.create()` nhưng **không có consumer nào gọi method này**.
- **Cần mở rộng:**
  - ❓ Cần implement `MediaUploadConsumer` để decode Base64 từ Kafka → upload S3 → tạo MediaLog record.

### 4.9 WebSocket Gateway — ✅ Hoạt động, cần mở rộng

- Subscribe/Broadcast cho telemetry, alerts, device-status.
- **Cần mở rộng:**
  - ⚠️ **Không có authentication** trên WebSocket — bất kỳ ai cũng có thể connect và subscribe device/user room.
  - ❓ Cần middleware xác thực session token trước khi cho phép subscribe.

### 4.10 MQTT Service — ✅ Ổn định

- Bridge MQTT → Kafka cho coordinates, alerts, media (image/video).
- **Cần sửa nhỏ:**
  - ⚠️ Chưa có MQTT topic cho `device-status` heartbeat — `gnss/+/status` chưa được subscribe.

---

## 5. Tổng hợp: Cần sửa vs Cần mở rộng

### 🔧 CẦN SỬA (Bugs / Vấn đề thiết kế)

| # | Vị trí                         | Vấn đề                                                       | Mức độ    |
|---|--------------------------------|---------------------------------------------------------------|-----------|
| 1 | `devices.service.ts:remove()`  | Hard delete thay vì soft delete — mất dữ liệu lịch sử cascade | 🔴 Cao   |
| 2 | `geofences.service.ts:remove()`| Hard delete thay vì soft delete                               | 🔴 Cao   |
| 3 | `geofences.service.ts:findAll()` | `ST_AsGeoJSON` trong `.select()` array không hoạt động đúng với TypeORM | 🟡 Trung bình |
| 4 | `geofence.entity.ts`           | Thiếu GiST spatial index trên cột `geom`                     | 🟡 Trung bình |
| 5 | `gnss.gateway.ts`              | Không có WebSocket authentication — lỗ hổng bảo mật           | 🔴 Cao   |
| 6 | `mqtt.service.ts`              | Thiếu subscribe topic `gnss/+/status` cho device heartbeat    | 🟡 Trung bình |
| 7 | ~~`media.entity.ts`~~          | ~~Thiếu `updatedAt`, `deletedAt`, `class-validator`~~ — ✅ **Đã sửa** | ✅ Xong  |
| 8 | ~~`base.entity.ts`~~           | ~~Lặp code `updatedAt`~~ — ✅ **Đã sửa**: Base cung cấp `updatedAt`, entity con xóa trùng lặp | ✅ Xong |

### 🚀 CẦN MỞ RỘNG (Tính năng mới)

| # | Tính năng                              | Module ảnh hưởng                     | Mức độ ưu tiên | Trạng thái kế hoạch |
|---|----------------------------------------|--------------------------------------|----------------|---------------------|
| 1 | **Notifications Module (in-app inbox)**| Tạo mới `notifications/`             | 🔴 Cao         | Có trong `EXPAND.md` |
| 2 | **Media Upload Consumer**              | `media-logs/` + `storage/`           | 🔴 Cao         | Thiết kế xong, chưa code |
| 3 | **Realtime Geofence Check**            | `telemetry/` + `geofences/`          | 🔴 Cao         | `getViolatedGeofences()` đã có, chưa gọi |
| 4 | **WebSocket Auth Middleware**          | `gateways/`                          | 🔴 Cao         | Chưa có kế hoạch    |
| 5 | **Admin User Management API**          | `users/`                             | 🟡 Trung bình  | Chưa có kế hoạch    |
| 6 | **Trajectory Deviation Detection**     | `telemetry/` + `alerts/`             | 🟡 Trung bình  | Enum đã có, logic chưa implement |
| 7 | **Telemetry Partitioning / Archiving** | `telemetry/` + Database              | 🟡 Trung bình  | Chưa có kế hoạch    |
| 8 | **Alert Statistics / Dashboard API**   | `alerts/`                            | 🟢 Thấp        | Chưa có kế hoạch    |
| 9 | **MQTT Device Status Topic**           | `mqtt/` + `device-status/`           | 🟡 Trung bình  | Kafka topic đã có, MQTT bridge thiếu |
| 10| **OpenSearch Integration**             | `search/` + các module               | 🟢 Thấp        | Module tồn tại nhưng chưa dùng |

---

### Kafka Topics — Trạng thái triển khai

| Topic                  | Enum                        | Producer    | Consumer             | Trạng thái      |
|------------------------|-----------------------------|-------------|----------------------|-----------------|
| `auth.mail`            | `KafkaTopic.AUTH_MAIL`       | AuthModule  | `MailConsumer`       | ✅ Hoạt động    |
| `auth.mail.dlq`        | `KafkaTopic.AUTH_MAIL_DLQ`   | MailConsumer| —                    | ✅ DLQ sẵn sàng |
| `storage.upload`       | `KafkaTopic.STORAGE_UPLOAD`  | StorageService | `StorageConsumer` | ✅ Hoạt động    |
| `storage.delete`       | `KafkaTopic.STORAGE_DELETE`  | —           | `StorageConsumer`    | ✅ Có consumer  |
| `gnss.coordinates`     | `KafkaTopic.GNSS_COORDINATES`| MqttService | `TelemetryConsumer`  | ✅ Hoạt động    |
| `gnss.alerts`          | `KafkaTopic.GNSS_ALERTS`     | MqttService | `AlertsConsumer`     | ✅ Hoạt động    |
| `gnss.media.upload`    | `KafkaTopic.GNSS_MEDIA_UPLOAD`| MqttService| **❌ Chưa có consumer** | ⚠️ Thiếu consumer |
| `gnss.device.status`   | `KafkaTopic.GNSS_DEVICE_STATUS`| **❌ Chưa có producer** | `DeviceStatusConsumer` | ⚠️ Thiếu MQTT bridge |

---

> **Kết luận:** Dự án đã có nền tảng vững chắc với đầy đủ các module GNSS cốt lõi. Các vấn đề cần sửa chủ yếu xoay quanh **soft delete**, **PostGIS optimization**, và **WebSocket security**. Các tính năng cần mở rộng ưu tiên cao nhất là **Notifications inbox**, **Media Upload Consumer**, **Realtime Geofence Check**, và **WebSocket Authentication**.
