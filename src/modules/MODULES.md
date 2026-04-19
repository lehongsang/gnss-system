# 🗂️ GNSS System — Module Blueprint

Tài liệu này định nghĩa cấu trúc đầy đủ của tất cả module trong hệ thống GNSS.
Dùng làm nguồn tham chiếu khi AI sinh code (entities, services, controllers).

---

## 📐 Kiến trúc tổng quan

```
src/modules/
├── combine.module.ts          ← Import tất cả module vào đây
├── auth/                      ← (đã có, BetterAuth)
├── users/                     ← (đã có)
├── root/                      ← Health check (đã có)
│
├── devices/                   ← Quản lý thiết bị GNSS
├── device-status/             ← Trạng thái realtime của thiết bị
├── telemetry/                 ← Dữ liệu GPS time-series (PostGIS)
├── geofences/                 ← Hàng rào địa lý (Polygon)
├── alerts/                    ← Cảnh báo từ thiết bị
└── media-logs/                ← Metadata video/image từ Object Storage
```

---

## ⚙️ Quy ước bắt buộc (PHẢI tuân thủ khi sinh code)

### 1. Stack & Imports

- **ORM**: TypeORM với `@InjectRepository`
- **Auth/Session**: `@Session()` từ `@thallesp/nestjs-better-auth` để lấy user hiện tại
- **Roles**: `@Roles()` từ `@thallesp/nestjs-better-auth` + enum `Role` tại `@/commons/enums/app.enum`
- **Public endpoint**: `@AllowAnonymous()` từ `@thallesp/nestjs-better-auth`
- **Logger**: `LoggerService` tại `@/commons/logger/logger.service`
- **Cache**: `RedisService` tại `@/services/redis/redis.service`
- **Queue**: `KafkaService` tại `@/services/kafka/kafka.service`
- **Path alias**: Dùng `@/` thay vì relative path khi import ngoài cùng module
- **Swagger**: Dùng `@Doc()` decorator tại `@/commons/docs/doc.decorator` cho mọi endpoint

### 2. Entity — `extends BaseEntity`

> [!IMPORTANT]
> **KHÔNG** tự khai báo `id`, `createdAt`, `updatedAt`. Ba trường này đã có sẵn trong `BaseEntity`.

```typescript
// src/commons/entities/base.entity.ts (ĐÃ CÓ SẴN — chỉ extend, không copy)
export class BaseEntity {
  id: string;          // uuid v7, tự generate @BeforeInsert
  createdAt: Date;     // CURRENT_TIMESTAMP
  updatedAt: Date;     // @UpdateDateColumn
}
```

**Cách dùng:**
```typescript
import { BaseEntity } from '@/commons/entities/base.entity';

@Entity('devices')
export class Device extends BaseEntity {
  @Column({ type: 'varchar', nullable: false })
  name: string;
  // ... các cột khác, KHÔNG khai báo id/createdAt/updatedAt
}
```

### 3. DTO — Validation đầy đủ

> [!IMPORTANT]
> Mọi field trong DTO **phải** có đủ decorator `class-validator` và `@ApiProperty`.

**Validator thường dùng:**
```typescript
@IsUUID('7')        // cho id references (dùng uuid v7)
@IsString()
@IsNotEmpty()
@IsOptional()
@IsEnum(MyEnum)
@IsNumber()
@IsBoolean()
@IsDate()
@MinLength(3)
@MaxLength(255)
@IsLatitude()
@IsLongitude()
@IsUrl()
```

### 4. DTOs tái sử dụng từ `@/commons/dtos`

| Class | Mục đích |
|---|---|
| `GetManyBaseQueryParams` | Query phân trang: `page`, `limit`, `sortBy`, `sortOrder`, `search` |
| `GetManyBaseResponseDto<T>` | Response phân trang: `data[]`, `total`, `page`, `limit`, `pageCount` |
| `GetManyWithStatusQueryParams` | Mở rộng GetManyBase + thêm `status` filter |
| `DefaultMessageResponseDto` | Response đơn giản: `{ message: string }` |
| `IdQueryParamDto` | Path param `:id` với `@IsUUID('7')` |
| `LocationDto` | `{ longitude: number, latitude: number }` |

### 5. Phân quyền Role

```
Role.ADMIN  →  'admin'   (toàn quyền)
Role.USER   →  'user'    (chỉ quản lý tài nguyên của mình)
ALL_ROLES   →  [Role.USER, Role.ADMIN]
```

**Pattern controller:**
```typescript
// Admin: xem tất cả
@Get()
@Roles(Role.ADMIN)
async findAll(@Query() query: GetManyBaseQueryParams) { ... }

// User: chỉ xem của mình (dùng @Session)
@Get('mine')
@Roles(ALL_ROLES)
async findMine(@Session() user: User, @Query() query: GetManyBaseQueryParams) { ... }

// Lấy một record — check ownership trong service
@Get(':id')
@Roles(ALL_ROLES)
async findOne(@Param('id') id: string, @Session() user: User) { ... }
```

### 6. Session pattern

```typescript
import { Session } from '@thallesp/nestjs-better-auth';
import { User } from '@/modules/auth/entities/user.entity';

// Trong controller method
async getMe(@Session() user: User) {
  return this.service.findByOwner(user.id);
}
```

### 7. Cấu trúc file mỗi module

```
modules/{name}/
├── {name}.module.ts
├── {name}.controller.ts
├── {name}.service.ts
├── entities/
│   └── {name}.entity.ts
└── dtos/
    ├── create-{name}.dto.ts
    └── update-{name}.dto.ts     ← dùng PartialType(CreateDto)
```

---

## 📦 MODULE 1: Devices (`src/modules/devices/`)

### Entity: `Device`

```typescript
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('devices')
export class Device extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', nullable: false })
  name: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', unique: true, nullable: true, name: 'mac_address' })
  macAddress: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;
}
```

### DTOs

```typescript
// create-device.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Matches } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ example: 'Drone Camera #01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'AA:BB:CC:DD:EE:FF' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, { message: 'Invalid MAC address format' })
  macAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  ownerId?: string;  // Chỉ ADMIN mới set được, USER thì tự động lấy session.id
}

// update-device.dto.ts
import { PartialType } from '@nestjs/swagger';
export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {}
```

### Service Methods

```typescript
// devices.service.ts
@Injectable()
export class DevicesService {
  // ADMIN: lấy tất cả, có phân trang + search theo name
  async findAll(query: GetManyBaseQueryParams): Promise<GetManyBaseResponseDto<Device>>

  // USER: chỉ lấy thiết bị của mình
  async findMine(ownerId: string, query: GetManyBaseQueryParams): Promise<GetManyBaseResponseDto<Device>>

  // Cả hai: lấy chi tiết, service tự check ownership nếu là USER
  async findOne(id: string, requesterId: string, isAdmin: boolean): Promise<Device>

  // USER: tạo và tự gán owner = session.id
  async create(dto: CreateDeviceDto, ownerId: string): Promise<Device>

  // USER có thể sửa device của mình, ADMIN sửa được tất cả
  async update(id: string, dto: UpdateDeviceDto, requesterId: string, isAdmin: boolean): Promise<Device>

  // Chỉ ADMIN
  async remove(id: string): Promise<DefaultMessageResponseDto>

  // Internal — dùng trong MqttService khi device kết nối
  async findByMac(macAddress: string): Promise<Device | null>
}
```

### Controller Endpoints

```typescript
@ApiTags('Devices')
@Controller('devices')
export class DevicesController {
  // GET /devices — ADMIN: tất cả, phân trang
  @Get()
  @Roles(Role.ADMIN)
  @Doc({ summary: 'Role: Admin - Get all devices (paginated)' })
  async findAll(@Query() query: GetManyBaseQueryParams) { ... }

  // GET /devices/mine — USER: thiết bị của mình
  @Get('mine')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get my devices' })
  async findMine(@Session() user: User, @Query() query: GetManyBaseQueryParams) { ... }

  // GET /devices/:id — ALL: ADMIN xem tất cả, USER chỉ xem của mình
  @Get(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get device by id' })
  async findOne(@Param('id') id: string, @Session() user: User) { ... }

  // POST /devices — ALL: tạo device, owner = session.id
  @Post()
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Create new device' })
  async create(@Body() dto: CreateDeviceDto, @Session() user: User) { ... }

  // PATCH /devices/:id — ALL: USER chỉ sửa của mình
  @Patch(':id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Update device' })
  async update(@Param('id') id: string, @Body() dto: UpdateDeviceDto, @Session() user: User) { ... }

  // DELETE /devices/:id — ADMIN only
  @Delete(':id')
  @Roles(Role.ADMIN)
  @Doc({ summary: 'Role: Admin - Delete device' })
  async remove(@Param('id') id: string) { ... }
}
```

---

## 📦 MODULE 2: Device Status (`src/modules/device-status/`)

### Entity: `DeviceStatus`

> **Lưu ý:** Bảng này dùng `device_id` làm PK (1-1 với Device), **không** extends BaseEntity vì không có `createdAt/updatedAt` theo chuẩn chung.

```typescript
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum DeviceStatusEnum {
  ONLINE      = 'online',
  OFFLINE     = 'offline',
  MAINTENANCE = 'maintenance',
}

@Entity('device_status')
export class DeviceStatus {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid', name: 'device_id' })
  deviceId: string;

  @OneToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: DeviceStatusEnum, required: false })
  @Column({ type: 'enum', enum: DeviceStatusEnum, nullable: true })
  status: DeviceStatusEnum | null;

  @ApiProperty({ required: false })
  @Column({ type: 'integer', nullable: true, name: 'battery_level' })
  batteryLevel: number | null;

  @ApiProperty({ required: false })
  @Column({ type: 'boolean', nullable: true, name: 'camera_status' })
  cameraStatus: boolean | null;

  @ApiProperty({ required: false })
  @Column({ type: 'boolean', nullable: true, name: 'gnss_status' })
  gnssStatus: boolean | null;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### DTOs

```typescript
// update-device-status.dto.ts (Internal, dùng trong Kafka consumer)
export class UpdateDeviceStatusDto {
  @IsOptional()
  @IsEnum(DeviceStatusEnum)
  status?: DeviceStatusEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @IsOptional()
  @IsBoolean()
  cameraStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  gnssStatus?: boolean;
}
```

### Service Methods

```typescript
@Injectable()
export class DeviceStatusService implements OnModuleInit {
  // Kafka consumer — subscribe topic 'gnss.device.status'
  async onModuleInit(): Promise<void>

  // Lấy trạng thái — USER chỉ xem device của mình
  async findByDevice(deviceId: string, requesterId: string, isAdmin: boolean): Promise<DeviceStatus>

  // Internal — upsert từ Kafka message
  async upsert(deviceId: string, dto: UpdateDeviceStatusDto): Promise<DeviceStatus>
}
```

### Controller Endpoints

```typescript
// GET /devices/:id/status — ALL
@Get(':id/status')
@Roles(ALL_ROLES)
async getStatus(@Param('id') id: string, @Session() user: User) { ... }
```

---

## 📦 MODULE 3: Telemetry (`src/modules/telemetry/`)

> [!IMPORTANT]
> **Bắt buộc** chạy SQL setup sau migrate:
> ```sql
> CREATE EXTENSION IF NOT EXISTS postgis;
> CREATE EXTENSION IF NOT EXISTS timescaledb;
> SELECT create_hypertable('telemetry', 'timestamp');
> ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
> CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry (device_id, timestamp DESC);
> CREATE INDEX IF NOT EXISTS idx_telemetry_geom ON telemetry USING GIST (geom);
> ```

### Entity: `Telemetry`

> **Lưu ý:** Dùng `@PrimaryGeneratedColumn('increment')` (bigserial), **không** extends BaseEntity.

```typescript
import { Column, Entity, ManyToOne, JoinColumn, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum AccuracyStatus {
  GNSS_ONLY   = 'gnss_only',
  VISION_ONLY = 'vision_only',
  FUSED       = 'fused',
}

@Entity('telemetry')
@Index(['deviceId', 'timestamp'])
export class Telemetry {
  @ApiProperty()
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ApiProperty()
  @Column({ type: 'uuid', name: 'device_id', nullable: false })
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty()
  @Column({ type: 'timestamp', nullable: false })
  timestamp: Date;

  @ApiProperty()
  @Column({ type: 'float', nullable: false })
  lat: number;

  @ApiProperty()
  @Column({ type: 'float', nullable: false })
  lng: number;

  @ApiProperty({ enum: AccuracyStatus, required: false })
  @Column({ type: 'enum', enum: AccuracyStatus, nullable: true, name: 'accuracy_status' })
  accuracyStatus: AccuracyStatus | null;

  // geom column được thêm thủ công qua SQL migration (TypeORM không hỗ trợ geometry natively)
  // INSERT: ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
  // SELECT: ST_AsGeoJSON(geom)
}
```

### DTOs

```typescript
// query-telemetry.dto.ts
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';

export class TelemetryHistoryQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  @IsDateString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  @IsNotEmpty()
  to: string;
}

export class NearbyQueryDto {
  @ApiProperty({ example: 10.7769 })
  @IsLatitude()
  @IsNotEmpty()
  lat: number;

  @ApiProperty({ example: 106.6958 })
  @IsLongitude()
  @IsNotEmpty()
  lng: number;

  @ApiProperty({ example: 500, description: 'Bán kính tính bằng mét' })
  @IsNumber()
  @Min(1)
  @Max(50000)
  radius: number;
}
```

### Service Methods

```typescript
@Injectable()
export class TelemetryService implements OnModuleInit {
  // Kafka consumer — subscribe 'gnss.coordinates'
  // Sau khi lưu, check geofence và tạo Alert nếu cần
  async onModuleInit(): Promise<void>

  // Lưu điểm GPS (internal, gọi từ Kafka)
  async savePoint(deviceId: string, payload: CoordinatePayload): Promise<void>

  // USER chỉ xem history device của mình
  async findHistory(
    deviceId: string,
    query: TelemetryHistoryQueryDto,
    requesterId: string,
    isAdmin: boolean
  ): Promise<GetManyBaseResponseDto<Telemetry>>

  // Vị trí mới nhất
  async findLatest(deviceId: string, requesterId: string, isAdmin: boolean): Promise<Telemetry>

  // PostGIS ST_DWithin — ADMIN only
  async findNearby(query: NearbyQueryDto): Promise<Telemetry[]>
}
```

### Controller Endpoints

```typescript
@ApiTags('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  // GET /telemetry/:deviceId/history — ALL (USER chỉ xem device mình)
  @Get(':deviceId/history')
  @Roles(ALL_ROLES)
  async getHistory(@Param('deviceId') deviceId: string, @Query() query: TelemetryHistoryQueryDto, @Session() user: User) { }

  // GET /telemetry/:deviceId/latest — ALL
  @Get(':deviceId/latest')
  @Roles(ALL_ROLES)
  async getLatest(@Param('deviceId') deviceId: string, @Session() user: User) { }

  // GET /telemetry/nearby — ADMIN only
  @Get('nearby')
  @Roles(Role.ADMIN)
  async getNearby(@Query() query: NearbyQueryDto) { }
}
```

---

## 📦 MODULE 4: Geofences (`src/modules/geofences/`)

> [!IMPORTANT]
> ```sql
> ALTER TABLE geofences ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326) NOT NULL;
> CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST (geom);
> ```

### Entity: `Geofence`

```typescript
import { Entity, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('geofences')
export class Geofence extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', nullable: false })
  name: string;

  // geom (Polygon) thêm qua SQL migration
  // INSERT: ST_GeomFromGeoJSON(:geomGeoJson)
  // SELECT: ST_AsGeoJSON(geom) as geom

  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @ManyToMany(() => Device)
  @JoinTable({
    name: 'device_geofence',
    joinColumn: { name: 'geofence_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'device_id', referencedColumnName: 'id' },
  })
  devices: Device[];
}
```

### DTOs

```typescript
// create-geofence.dto.ts
export class CreateGeofenceDto {
  @ApiProperty({ example: 'Khu vực an toàn A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'GeoJSON Polygon coordinates',
    example: { type: 'Polygon', coordinates: [[[106.0, 10.0], [106.5, 10.0], [106.5, 10.5], [106.0, 10.0]]] }
  })
  @IsNotEmpty()
  @IsObject()
  geom: object;  // GeoJSON Polygon, validate chi tiết bằng custom validator nếu cần
}

export class AssignDeviceDto {
  @ApiProperty()
  @IsUUID('7')
  @IsNotEmpty()
  deviceId: string;
}
```

### Service Methods

```typescript
@Injectable()
export class GeofencesService {
  // ADMIN: tất cả; USER: của mình (created_by = session.id)
  async findAll(query: GetManyBaseQueryParams, requesterId: string, isAdmin: boolean): Promise<GetManyBaseResponseDto<Geofence>>

  async findOne(id: string, requesterId: string, isAdmin: boolean): Promise<Geofence>

  async create(dto: CreateGeofenceDto, userId: string): Promise<Geofence>

  async update(id: string, dto: UpdateGeofenceDto, requesterId: string, isAdmin: boolean): Promise<Geofence>

  async remove(id: string, requesterId: string, isAdmin: boolean): Promise<DefaultMessageResponseDto>

  async assignDevice(geofenceId: string, deviceId: string): Promise<DefaultMessageResponseDto>

  async removeDevice(geofenceId: string, deviceId: string): Promise<DefaultMessageResponseDto>

  // Internal — dùng trong TelemetryService để check thiết bị có trong vùng ko
  // PostGIS: ST_Within(ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), geom)
  async getViolatedGeofences(deviceId: string, lat: number, lng: number): Promise<Geofence[]>
}
```

### Controller Endpoints

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/geofences` | ADMIN | Tất cả geofence (phân trang) |
| GET | `/geofences/mine` | ALL | Geofence của mình |
| GET | `/geofences/:id` | ALL | Chi tiết (ownership check) |
| POST | `/geofences` | ALL | Tạo geofence |
| PATCH | `/geofences/:id` | ALL | Cập nhật (ownership check) |
| DELETE | `/geofences/:id` | ALL | Xóa (ownership check) |
| POST | `/geofences/:id/devices` | ALL | Gán device (kèm `body: AssignDeviceDto`) |
| DELETE | `/geofences/:id/devices/:deviceId` | ALL | Gỡ device |

---

## 📦 MODULE 5: Alerts (`src/modules/alerts/`)

### Entity: `Alert`

```typescript
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum AlertType {
  TRAJECTORY_DEVIATION = 'trajectory_deviation',
  DANGEROUS_OBSTACLE   = 'dangerous_obstacle',
  SIGNAL_LOST          = 'signal_lost',
  GEOFENCE_EXIT        = 'geofence_exit',
  SPEEDING             = 'speeding',
}

@Entity('alerts')
@Index(['deviceId', 'createdAt'])
export class Alert extends BaseEntity {
  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'device_id', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ enum: AlertType })
  @Column({ type: 'enum', enum: AlertType, name: 'alert_type', nullable: false })
  alertType: AlertType;

  @ApiProperty({ required: false })
  @Column({ type: 'text', nullable: true })
  message: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @ApiProperty({ required: false })
  @Column({ type: 'float', nullable: true })
  lng: number | null;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true, name: 'snapshot_url' })
  snapshotUrl: string | null;

  @ApiProperty()
  @Column({ type: 'boolean', default: false, name: 'is_resolved' })
  isResolved: boolean;
}
```

### DTOs

```typescript
// query-alert.dto.ts
export class AlertQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  deviceId?: string;

  @ApiPropertyOptional({ enum: AlertType })
  @IsOptional()
  @IsEnum(AlertType)
  alertType?: AlertType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isResolved?: boolean;
}

// create-alert.dto.ts (Internal — dùng trong Kafka consumer)
export class CreateAlertDto {
  @IsUUID('7')
  @IsNotEmpty()
  deviceId: string;

  @IsEnum(AlertType)
  @IsNotEmpty()
  alertType: AlertType;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsUrl()
  snapshotUrl?: string;
}
```

### Service Methods

```typescript
@Injectable()
export class AlertsService implements OnModuleInit {
  // Kafka consumer — subscribe 'gnss.alerts'
  async onModuleInit(): Promise<void>

  // ADMIN: tất cả; USER: chỉ alert của device mình sở hữu
  async findAll(query: AlertQueryDto, requesterId: string, isAdmin: boolean): Promise<GetManyBaseResponseDto<Alert>>

  async findOne(id: string, requesterId: string, isAdmin: boolean): Promise<Alert>

  // Đánh dấu đã xử lý — ownership check
  async resolve(id: string, requesterId: string, isAdmin: boolean): Promise<Alert>

  // Internal — gọi từ Kafka consumer hoặc TelemetryService
  async create(dto: CreateAlertDto): Promise<Alert>
}
```

### Controller Endpoints

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/alerts` | ADMIN | Tất cả cảnh báo (phân trang + filter) |
| GET | `/alerts/mine` | ALL | Cảnh báo của device mình sở hữu |
| GET | `/alerts/:id` | ALL | Chi tiết (ownership check) |
| PATCH | `/alerts/:id/resolve` | ALL | Đánh dấu đã xử lý |

---

## 📦 MODULE 6: Media Logs (`src/modules/media-logs/`)

### Entity: `MediaLog`

```typescript
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum MediaType {
  VIDEO_CHUNK  = 'video_chunk',
  IMAGE_FRAME  = 'image_frame',
}

@Entity('media_logs')
@Index(['deviceId', 'startTime'])
export class MediaLog extends BaseEntity {
  @ApiProperty({ required: false })
  @Column({ type: 'uuid', name: 'device_id', nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamp', name: 'start_time', nullable: true })
  startTime: Date | null;

  @ApiProperty({ required: false })
  @Column({ type: 'timestamp', name: 'end_time', nullable: true })
  endTime: Date | null;

  @ApiProperty({ enum: MediaType, required: false })
  @Column({ type: 'enum', enum: MediaType, name: 'media_type', nullable: true })
  mediaType: MediaType | null;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: false, name: 'file_url' })
  fileUrl: string;
}
```

### DTOs

```typescript
// query-media-log.dto.ts
export class MediaLogQueryDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('7')
  deviceId?: string;

  @ApiPropertyOptional({ enum: MediaType })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
```

### Service Methods

```typescript
@Injectable()
export class MediaLogsService implements OnModuleInit {
  // Kafka consumer — subscribe 'gnss.media.upload'
  // StorageService upload file lên S3 → lưu metadata vào đây
  async onModuleInit(): Promise<void>

  // ADMIN: tất cả; USER: device của mình
  async findAll(query: MediaLogQueryDto, requesterId: string, isAdmin: boolean): Promise<GetManyBaseResponseDto<MediaLog>>

  async findOne(id: string, requesterId: string, isAdmin: boolean): Promise<MediaLog>

  // Tạo presigned URL để stream/download
  async getStreamUrl(id: string, requesterId: string, isAdmin: boolean): Promise<{ url: string }>

  // Internal
  async create(data: Partial<MediaLog>): Promise<MediaLog>
}
```

### Controller Endpoints

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/media-logs` | ADMIN | Tất cả media log (phân trang + filter) |
| GET | `/media-logs/mine` | ALL | Media log của device mình |
| GET | `/media-logs/:id` | ALL | Chi tiết |
| GET | `/media-logs/:id/stream` | ALL | Lấy presigned URL để xem |

---

## 🔗 Luồng Kafka

```
MqttService (Bridge)
    │
    ├─ gnss.coordinates  →  TelemetryService      →  savePoint() → lưu Telemetry
    │                                                → getViolatedGeofences() → AlertsService.create()
    │
    ├─ gnss.alerts       →  AlertsService         →  create() → lưu Alert
    │
    └─ gnss.media.upload →  StorageService        →  uploadFile() → S3
                                                   →  MediaLogsService.create() → lưu metadata
```

---

## 🔧 Đăng ký vào `combine.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RootModule } from './root/root.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { DeviceStatusModule } from './device-status/device-status.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { GeofencesModule } from './geofences/geofences.module';
import { AlertsModule } from './alerts/alerts.module';
import { MediaLogsModule } from './media-logs/media-logs.module';

@Module({
  imports: [
    AuthModule, RootModule, UsersModule,
    DevicesModule, DeviceStatusModule, TelemetryModule,
    GeofencesModule, AlertsModule, MediaLogsModule,
  ],
})
export class CombineModule {}
```

---

## 🗄️ Database Setup

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- TimescaleDB hypertable (chạy NGAY SAU khi tạo bảng, trước khi insert data)
SELECT create_hypertable('telemetry', 'timestamp');

-- Geometry columns (TypeORM không tự tạo được)
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
ALTER TABLE geofences ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326) NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry (device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_geom       ON telemetry USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_geofences_geom       ON geofences USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_alerts_device_time   ON alerts (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_device_time    ON media_logs (device_id, start_time DESC);
```
