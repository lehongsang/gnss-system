# 🛠️ Kế hoạch mở rộng — Nhóm 1 (4 tính năng cốt lõi)

> Tài liệu này mô tả **chi tiết những gì sẽ thay đổi** trong từng file khi triển khai 4 tính năng nhóm 1.
> Mọi code snippet đều bám sát kiến trúc hiện tại (TypeORM, KafkaService, BetterAuth session, `@Doc()` decorator).

---

## Tổng quan thay đổi

| # | Tính năng | Loại thay đổi | Độ phức tạp |
|---|---|---|---|
| 1 | **WebSocket Realtime Gateway** | Tạo mới module `gateways/` | ⭐⭐ |
| 2 | **Notification Module (in-app + email)** | Tạo mới module `notifications/` | ⭐⭐ |
| 3 | **Presigned URL thực sự cho Media** | Sửa entity + service `media-logs/` | ⭐ |
| 4 | **Server-side Speed Detection** | Sửa entity `devices/` + service `telemetry/` | ⭐ |

---

## 📋 TÍNH NĂNG 1 — WebSocket Realtime Gateway

### Mục tiêu
Push dữ liệu GPS và cảnh báo realtime xuống frontend thông qua Socket.IO, thay vì client phải polling REST API.

### Package cần cài
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install --save-dev @types/socket.io
```

### Cấu trúc file mới

```
src/
└── gateways/
    ├── gnss.gateway.ts          ← WebSocketGateway chính
    └── gnss.gateway.module.ts   ← Module export GnssGateway
```

### Chi tiết triển khai

#### `src/gateways/gnss.gateway.ts` — TẠO MỚI

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: 'gnss',
  transports: ['websocket', 'polling'],
})
export class GnssGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Client gửi event này để theo dõi 1 device
  @SubscribeMessage('subscribe:device')
  handleSubscribeDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId: string,
  ) {
    client.join(`device:${deviceId}`);
    client.emit('subscribed', { deviceId });
  }

  // Client hủy theo dõi
  @SubscribeMessage('unsubscribe:device')
  handleUnsubscribeDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId: string,
  ) {
    client.leave(`device:${deviceId}`);
  }

  // Gọi từ TelemetryService sau khi savePoint()
  broadcastTelemetry(deviceId: string, data: {
    lat: number; lng: number; timestamp: Date; speed?: number;
  }) {
    this.server.to(`device:${deviceId}`).emit('telemetry:update', data);
  }

  // Gọi từ AlertsService sau khi create()
  broadcastAlert(deviceOwnerId: string, alert: {
    id: string; alertType: string; message: string | null; lat: number | null; lng: number | null;
  }) {
    // Push vào room của owner (user subscribe room cá nhân khi login)
    this.server.to(`user:${deviceOwnerId}`).emit('alert:new', alert);
  }

  // Client join room cá nhân để nhận thông báo
  @SubscribeMessage('join:user')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    client.join(`user:${userId}`);
  }

  handleConnection(client: Socket) {
    console.log(`WS Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`WS Client disconnected: ${client.id}`);
  }
}
```

#### `src/gateways/gnss.gateway.module.ts` — TẠO MỚI

```typescript
import { Module } from '@nestjs/common';
import { GnssGateway } from './gnss.gateway';

@Module({
  providers: [GnssGateway],
  exports: [GnssGateway],   // Export để inject vào TelemetryService và AlertsService
})
export class GnssGatewayModule {}
```

### File cần SỬA

#### `src/app.module.ts` — THÊM import

```typescript
// Thêm vào imports[]
import { GnssGatewayModule } from './gateways/gnss.gateway.module';
// ...
imports: [
  // ... existing imports ...
  GnssGatewayModule,
]
```

#### `src/modules/telemetry/telemetry.module.ts` — THÊM import

```typescript
imports: [
  TypeOrmModule.forFeature([Telemetry]),
  DevicesModule,
  GnssGatewayModule,  // ← THÊM
]
```

#### `src/modules/telemetry/telemetry.service.ts` — SỬA `savePoint()`

```typescript
// Thêm vào constructor:
constructor(
  @InjectRepository(Telemetry)
  private readonly telemetryRepository: Repository<Telemetry>,
  private readonly devicesService: DevicesService,
  private readonly gnssGateway: GnssGateway,   // ← THÊM
) {}

// Sau khi save telemetry, thêm broadcast:
async savePoint(deviceId: string, payload: CoordinatePayload): Promise<void> {
  // ... existing save logic ...

  // ← THÊM sau khi save thành công:
  this.gnssGateway.broadcastTelemetry(deviceId, {
    lat: payload.lat,
    lng: payload.lng,
    timestamp: payload.timestamp,
    speed: payload.speed,
  });
}
```

#### `src/modules/alerts/alerts.module.ts` — THÊM import

```typescript
imports: [
  TypeOrmModule.forFeature([Alert]),
  DevicesModule,
  GnssGatewayModule,  // ← THÊM
]
```

#### `src/modules/alerts/alerts.service.ts` — SỬA `create()`

```typescript
// Thêm vào constructor:
constructor(
  @InjectRepository(Alert) private readonly alertRepository: Repository<Alert>,
  private readonly devicesService: DevicesService,
  private readonly gnssGateway: GnssGateway,  // ← THÊM
) {}

// Sửa create():
async create(dto: CreateAlertDto): Promise<Alert> {
  const alert = this.alertRepository.create(dto);
  const saved = await this.alertRepository.save(alert);

  // ← THÊM: Lấy ownerId của device để push về đúng user
  if (saved.deviceId) {
    const device = await this.devicesService.findByMac(saved.deviceId)
      // hoặc dùng deviceRepository.findOne({ where: { id: saved.deviceId } })
    if (device?.ownerId) {
      this.gnssGateway.broadcastAlert(device.ownerId, {
        id: saved.id,
        alertType: saved.alertType,
        message: saved.message,
        lat: saved.lat,
        lng: saved.lng,
      });
    }
  }
  return saved;
}
```

### Luồng dữ liệu sau khi triển khai

```
GNSS Device → MQTT → Kafka(gnss.coordinates)
  → TelemetryService.savePoint()
    → DB save ✓
    → GnssGateway.broadcastTelemetry()
      → Socket.IO room `device:{deviceId}` → Frontend map cập nhật realtime

GNSS Device → MQTT → Kafka(gnss.alerts)
  → AlertsService.create()
    → DB save ✓
    → GnssGateway.broadcastAlert()
      → Socket.IO room `user:{ownerId}` → Frontend hiện toast cảnh báo
```

---

## 📋 TÍNH NĂNG 2 — Notification Module (In-app + Email)

### Mục tiêu
Lưu thông báo vào DB (`notifications` table) và gửi email khi có cảnh báo nghiêm trọng. User có thể đọc inbox thông báo qua API.

### Cấu trúc file mới

```
src/modules/notifications/
├── notifications.module.ts
├── notifications.controller.ts
├── notifications.service.ts
├── entities/
│   └── notification.entity.ts
└── dtos/
    └── query-notification.dto.ts
```

### Chi tiết triển khai

#### `src/modules/notifications/entities/notification.entity.ts` — TẠO MỚI

```typescript
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@/commons/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationType {
  ALERT        = 'alert',         // Cảnh báo từ thiết bị
  SYSTEM       = 'system',        // Thông báo hệ thống
  GEOFENCE     = 'geofence',      // Vì phạm vùng địa lý
}

@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid', name: 'user_id', nullable: false })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({ enum: NotificationType })
  @Column({ type: 'enum', enum: NotificationType, nullable: false })
  type: NotificationType;

  @ApiProperty()
  @Column({ type: 'varchar', nullable: false })
  title: string;

  @ApiProperty()
  @Column({ type: 'text', nullable: false })
  body: string;

  @ApiProperty({ required: false })
  @Column({ type: 'boolean', default: false, name: 'is_read' })
  isRead: boolean;

  // ID của entity liên quan (Alert.id, v.v.)
  @ApiProperty({ required: false })
  @Column({ type: 'uuid', nullable: true, name: 'reference_id' })
  referenceId: string | null;
}
```

#### `src/modules/notifications/dtos/query-notification.dto.ts` — TẠO MỚI

```typescript
import { GetManyBaseQueryParams } from '@/commons/dtos/get-many-base.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { NotificationType } from '../entities/notification.entity';

export class QueryNotificationDto extends GetManyBaseQueryParams {
  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isRead?: boolean;
}
```

#### `src/modules/notifications/notifications.service.ts` — TẠO MỚI

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { QueryNotificationDto } from './dtos/query-notification.dto';
import { GetManyBaseResponseDto } from '@/commons/dtos/get-many-base.dto';
import { MailService } from '@/services/mail/mail.service';
import { AlertType } from '@/modules/alerts/entities/alert.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly mailService: MailService,
  ) {}

  // Internal: gọi từ AlertsService.create() sau khi lưu Alert
  async createFromAlert(payload: {
    userId: string;
    alertType: AlertType;
    alertId: string;
    deviceName: string;
    message: string | null;
    userEmail: string;
  }): Promise<void> {
    const title = this.getAlertTitle(payload.alertType);
    const body = `Thiết bị "${payload.deviceName}": ${payload.message ?? title}`;

    // 1. Lưu notification vào DB
    await this.notificationRepo.save(
      this.notificationRepo.create({
        userId: payload.userId,
        type: NotificationType.ALERT,
        title,
        body,
        referenceId: payload.alertId,
        isRead: false,
      }),
    );

    // 2. Gửi email nếu loại alert nghiêm trọng
    const criticalAlerts: AlertType[] = [
      AlertType.GEOFENCE_EXIT,
      AlertType.SIGNAL_LOST,
      AlertType.DANGEROUS_OBSTACLE,
    ];
    if (criticalAlerts.includes(payload.alertType)) {
      await this.mailService.sendAlertEmail(payload.userEmail, title, body);
    }
  }

  async findAll(
    userId: string,
    query: QueryNotificationDto,
  ): Promise<GetManyBaseResponseDto<Notification>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC', type, isRead } = query;

    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId });

    if (type !== undefined) qb.andWhere('n.type = :type', { type });
    if (isRead !== undefined) qb.andWhere('n.isRead = :isRead', { isRead });

    const [data, total] = await qb
      .orderBy(`n.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, pageCount: Math.ceil(total / limit) };
  }

  // Đánh dấu một notification đã đọc
  async markRead(id: string, userId: string): Promise<Notification> {
    const notif = await this.notificationRepo.findOne({ where: { id, userId } });
    if (!notif) throw new NotFoundException('Notification not found');
    notif.isRead = true;
    return this.notificationRepo.save(notif);
  }

  // Đánh dấu toàn bộ đã đọc
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }

  // Đếm chưa đọc (dùng cho badge trên UI)
  async countUnread(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({ where: { userId, isRead: false } });
    return { count };
  }

  private getAlertTitle(type: AlertType): string {
    const map: Record<AlertType, string> = {
      [AlertType.GEOFENCE_EXIT]: '⚠️ Thiết bị thoát khỏi vùng địa lý',
      [AlertType.SPEEDING]: '🚨 Vượt tốc độ giới hạn',
      [AlertType.SIGNAL_LOST]: '📡 Mất tín hiệu GPS',
      [AlertType.DANGEROUS_OBSTACLE]: '🚧 Phát hiện chướng ngại vật',
      [AlertType.TRAJECTORY_DEVIATION]: '🛤️ Lệch khỏi quỹ đạo',
    };
    return map[type] ?? 'Cảnh báo từ thiết bị';
  }
}
```

#### `src/modules/notifications/notifications.controller.ts` — TẠO MỚI

```typescript
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  // GET /notifications — inbox của user hiện tại
  @Get()
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get my notifications' })
  findAll(@Session() user: User, @Query() query: QueryNotificationDto) {
    return this.service.findAll(user.id, query);
  }

  // GET /notifications/unread-count — số badge
  @Get('unread-count')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Get unread notification count' })
  countUnread(@Session() user: User) {
    return this.service.countUnread(user.id);
  }

  // PATCH /notifications/:id/read — đọc 1 thông báo
  @Patch(':id/read')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Mark notification as read' })
  markRead(@Param('id') id: string, @Session() user: User) {
    return this.service.markRead(id, user.id);
  }

  // PATCH /notifications/read-all — đọc hết
  @Patch('read-all')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Role: All - Mark all notifications as read' })
  markAllRead(@Session() user: User) {
    return this.service.markAllRead(user.id);
  }
}
```

#### `src/modules/notifications/notifications.module.ts` — TẠO MỚI

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Notification]), ServicesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

### File cần SỬA

#### `src/services/mail/mail.service.ts` — THÊM method `sendAlertEmail()`

```typescript
async sendAlertEmail(email: string, title: string, body: string): Promise<boolean> {
  try {
    await this.mailerService.sendMail({
      to: email,
      subject: title,
      template: './alert',     // cần tạo template HBS
      context: { title, body, currentYear: new Date().getFullYear() },
    });
    return true;
  } catch (error) {
    this.logger.error(`Failed to send alert email to ${email}: ${error}`);
    return false;
  }
}
```

#### `src/modules/alerts/alerts.module.ts` — THÊM NotificationsModule

```typescript
imports: [
  TypeOrmModule.forFeature([Alert]),
  DevicesModule,
  GnssGatewayModule,
  NotificationsModule,  // ← THÊM
]
```

#### `src/modules/alerts/alerts.service.ts` — SỬA `create()` để gọi NotificationsService

```typescript
// Thêm vào constructor:
constructor(
  @InjectRepository(Alert) private readonly alertRepository: Repository<Alert>,
  private readonly devicesService: DevicesService,
  private readonly gnssGateway: GnssGateway,
  private readonly notificationsService: NotificationsService,  // ← THÊM
) {}

async create(dto: CreateAlertDto): Promise<Alert> {
  const alert = this.alertRepository.create(dto);
  const saved = await this.alertRepository.save(alert);

  if (saved.deviceId) {
    const device = await this.deviceRepository.findOne({
      where: { id: saved.deviceId },
      relations: ['owner'],
    });

    if (device?.owner) {
      // WebSocket push (Tính năng 1)
      this.gnssGateway.broadcastAlert(device.owner.id, { ... });

      // In-app + Email notification (Tính năng 2)
      await this.notificationsService.createFromAlert({
        userId: device.owner.id,
        alertType: saved.alertType,
        alertId: saved.id,
        deviceName: device.name,
        message: saved.message,
        userEmail: device.owner.email,
      });
    }
  }

  return saved;
}
```

#### `src/modules/combine.module.ts` — THÊM NotificationsModule

```typescript
import { NotificationsModule } from './notifications/notifications.module';
// ...
imports: [
  // ... existing ...
  NotificationsModule,  // ← THÊM
]
```

---

## 📋 TÍNH NĂNG 3 — Presigned URL thực sự cho Media Stream

### Vấn đề hiện tại
`MediaLog.fileUrl` chứa URL tĩnh, nhưng SeaweedFS dùng **private bucket** → URL đó không truy cập được trực tiếp.
`getStreamUrl()` trả thẳng `log.fileUrl` — là placeholder chưa hoạt động.

### Giải pháp
1. Thêm cột `s3Key` vào `MediaLog` entity để lưu object key trong S3
2. Inject `StorageService` vào `MediaLogsService`
3. `getStreamUrl()` gọi `StorageService.getPresignedUrl(s3Key)`

### File cần SỬA

#### `src/modules/media-logs/entities/media-log.entity.ts` — THÊM cột `s3Key`

```typescript
@Entity('media_logs')
@Index(['deviceId', 'startTime'])
export class MediaLog extends BaseEntity {
  // ... các cột hiện tại giữ nguyên ...

  // ← THÊM: S3 object key để generate presigned URL
  @ApiProperty({ required: false })
  @Column({ type: 'varchar', nullable: true, name: 's3_key' })
  s3Key: string | null;
}
```

> **Lưu ý migration:** Cần thêm cột `s3_key` vào DB. TypeORM tự migrate nếu `synchronize: true`.
> Với production: `ALTER TABLE media_logs ADD COLUMN IF NOT EXISTS s3_key VARCHAR;`

#### `src/modules/media-logs/media-logs.module.ts` — THÊM StorageModule

```typescript
import { StorageModule } from '@/services/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaLog]),
    DevicesModule,
    StorageModule,   // ← THÊM
  ],
  // ...
})
```

#### `src/modules/media-logs/media-logs.service.ts` — SỬA `getStreamUrl()`

```typescript
// Thêm vào constructor:
constructor(
  @InjectRepository(MediaLog) private readonly mediaLogRepository: Repository<MediaLog>,
  private readonly devicesService: DevicesService,
  private readonly storageService: StorageService,  // ← THÊM
) {}

// Sửa getStreamUrl():
async getStreamUrl(
  id: string,
  requesterId: string,
  isAdmin: boolean,
): Promise<{ url: string; expiresAt: Date }> {
  const log = await this.findOne(id, requesterId, isAdmin);

  // Dùng s3Key nếu có, fallback về fileUrl
  if (log.s3Key) {
    const url = await this.storageService.getPresignedUrl(log.s3Key, 3600);
    if (url) {
      return {
        url,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };
    }
  }

  // Fallback: trả fileUrl gốc
  return {
    url: log.fileUrl,
    expiresAt: new Date(Date.now() + 3600 * 1000),
  };
}
```

#### `src/modules/media-logs/media-logs.controller.ts` — SỬA response type `stream`

```typescript
// Cập nhật mô tả Swagger cho endpoint stream:
@Get(':id/stream')
@Roles(ALL_ROLES)
@Doc({ summary: 'Role: All - Get presigned stream URL (valid 1 hour)' })
async getStreamUrl(@Param('id') id: string, @Session() user: User) {
  return this.mediaLogsService.getStreamUrl(
    id, user.id, user.role === Role.ADMIN,
  );
}
// Response: { url: string, expiresAt: Date }
```

#### `src/services/storage/storage.service.ts` — KIỂM TRA (không cần sửa)

> `getPresignedUrl(key, expiresInSeconds)` đã có sẵn và hoạt động đúng.
> Chỉ cần đảm bảo `StorageModule` export `StorageService`.

---

## 📋 TÍNH NĂNG 4 — Server-side Speed Detection

### Mục tiêu
Hệ thống tự động phát hiện vượt tốc và tạo `Alert` mà không cần device tự báo cáo.

### Cơ chế
- Thêm cột `speedLimitKmh` vào `Device` entity (user tự set ngưỡng tốc độ cho từng thiết bị)
- Sau khi lưu `Telemetry.savePoint()`, nếu `payload.speed > device.speedLimitKmh` → tạo Alert

### File cần SỬA

#### `src/modules/devices/entities/device.entity.ts` — THÊM cột `speedLimitKmh`

```typescript
@Entity('devices')
export class Device extends BaseEntity {
  // ... các cột hiện tại giữ nguyên ...

  // ← THÊM
  @ApiProperty({
    required: false,
    example: 80,
    description: 'Ngưỡng tốc độ tối đa (km/h). Nếu null = không giám sát tốc độ.',
  })
  @Column({ type: 'float', nullable: true, name: 'speed_limit_kmh' })
  speedLimitKmh: number | null;
}
```

#### `src/modules/devices/dtos/create-device.dto.ts` — THÊM field `speedLimitKmh`

```typescript
import { IsNumber, Min, Max } from 'class-validator';

export class CreateDeviceDto {
  // ... các field hiện tại giữ nguyên ...

  // ← THÊM
  @ApiPropertyOptional({
    example: 80,
    description: 'Ngưỡng tốc độ tối đa km/h (null = tắt giám sát)',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
  speedLimitKmh?: number;
}
```

#### `src/modules/telemetry/telemetry.service.ts` — SỬA `onModuleInit()` và `savePoint()`

> **Quan trọng:** Hiện tại Kafka consumer chưa được implement. Cần implement đồng thời.

```typescript
interface CoordinatePayload {
  lat: number;
  lng: number;
  speed?: number;          // ← THÊM (km/h, từ MQTT payload)
  heading?: number;
  timestamp: Date;
  accuracyStatus?: AccuracyStatus;
}

@Injectable()
export class TelemetryService implements OnModuleInit {
  constructor(
    @InjectRepository(Telemetry) private readonly telemetryRepository: Repository<Telemetry>,
    private readonly devicesService: DevicesService,
    private readonly kafkaService: KafkaService,
    private readonly gnssGateway: GnssGateway,         // Tính năng 1
    private readonly alertsService: AlertsService,      // ← THÊM để tạo alert
    private readonly geofencesService: GeofencesService, // đã thiết kế trong MODULES.md
  ) {}

  // IMPLEMENT Kafka consumer (đang là TODO)
  async onModuleInit() {
    this.kafkaService.consume(
      'gnss.coordinates',
      'gnss-coordinates-group',
      async ({ message }) => {
        if (!message.value) return;
        const payload = JSON.parse(message.value.toString()) as {
          deviceId: string;
          lat: number; lng: number;
          speed?: number;
          heading?: number;
          timestamp: string;
        };
        await this.savePoint(payload.deviceId, {
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed,
          timestamp: new Date(payload.timestamp),
        });
      }
    ).catch(err => console.error('Telemetry Kafka consumer error:', err));
  }

  async savePoint(deviceId: string, payload: CoordinatePayload): Promise<void> {
    // 1. Lưu telemetry (existing logic)
    const telemetry = this.telemetryRepository.create({ ... });
    await this.telemetryRepository.save(telemetry);
    await this.telemetryRepository.query(`UPDATE telemetry SET geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
      [payload.lng, payload.lat, telemetry.id]);

    // 2. WebSocket broadcast (Tính năng 1)
    this.gnssGateway.broadcastTelemetry(deviceId, {
      lat: payload.lat, lng: payload.lng,
      timestamp: payload.timestamp,
      speed: payload.speed,
    });

    // 3. Geofence check (đã thiết kế trong MODULES.md)
    const violated = await this.geofencesService.getViolatedGeofences(
      deviceId, payload.lat, payload.lng,
    );
    for (const geofence of violated) {
      await this.alertsService.create({
        deviceId,
        alertType: AlertType.GEOFENCE_EXIT,
        message: `Thiết bị thoát khỏi vùng "${geofence.name}"`,
        lat: payload.lat, lng: payload.lng,
      });
    }

    // 4. ← MỚI: Speed detection
    if (payload.speed !== undefined && payload.speed !== null) {
      const device = await this.deviceRepository.findOneBy({ id: deviceId });
      const limit = device?.speedLimitKmh;

      if (limit !== null && limit !== undefined && payload.speed > limit) {
        await this.alertsService.create({
          deviceId,
          alertType: AlertType.SPEEDING,
          message: `Vận tốc ${payload.speed.toFixed(1)} km/h vượt ngưỡng ${limit} km/h`,
          lat: payload.lat,
          lng: payload.lng,
        });
      }
    }
  }
}
```

> **Chống spam alert:** Cần thêm cơ chế cooldown để không tạo alert SPEEDING liên tục.
> Dùng Redis để lưu trạng thái: `redis.set(`speeding:${deviceId}`, '1', 'EX', 60)` — chỉ alert 1 lần/phút.

#### `src/modules/telemetry/telemetry.module.ts` — THÊM dependencies

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Telemetry]),
    DevicesModule,
    GeofencesModule,
    AlertsModule,      // ← THÊM
    GnssGatewayModule, // ← THÊM (Tính năng 1)
  ],
  // Chú ý circular dependency: AlertsModule cũng dùng DevicesModule → OK vì DevicesModule không import TelemetryModule
})
```

---

## 🗂️ Tóm tắt tất cả file thay đổi

### File TẠO MỚI

| File | Mục đích |
|---|---|
| `src/gateways/gnss.gateway.ts` | WebSocket gateway — broadcast telemetry & alerts |
| `src/gateways/gnss.gateway.module.ts` | Module export GnssGateway |
| `src/modules/notifications/entities/notification.entity.ts` | Bảng notifications |
| `src/modules/notifications/dtos/query-notification.dto.ts` | Query DTO |
| `src/modules/notifications/notifications.service.ts` | Logic tạo, query, đánh dấu đọc |
| `src/modules/notifications/notifications.controller.ts` | API endpoints |
| `src/modules/notifications/notifications.module.ts` | Module config |
| `src/services/mail/templates/alert.hbs` | Email template cảnh báo |

### File SỬA

| File | Thay đổi |
|---|---|
| `src/app.module.ts` | Import `GnssGatewayModule` |
| `src/modules/combine.module.ts` | Import `NotificationsModule` |
| `src/modules/telemetry/telemetry.module.ts` | Import `GnssGatewayModule`, `AlertsModule` |
| `src/modules/telemetry/telemetry.service.ts` | Implement Kafka consumer + speed detection + WS broadcast |
| `src/modules/alerts/alerts.module.ts` | Import `GnssGatewayModule`, `NotificationsModule` |
| `src/modules/alerts/alerts.service.ts` | `create()` gọi WS broadcast + notification |
| `src/modules/devices/entities/device.entity.ts` | Thêm cột `speedLimitKmh` |
| `src/modules/devices/dtos/create-device.dto.ts` | Thêm field `speedLimitKmh` |
| `src/modules/media-logs/entities/media-log.entity.ts` | Thêm cột `s3Key` |
| `src/modules/media-logs/media-logs.module.ts` | Import `StorageModule` |
| `src/modules/media-logs/media-logs.service.ts` | `getStreamUrl()` dùng presigned URL thực |
| `src/services/mail/mail.service.ts` | Thêm method `sendAlertEmail()` |

---

## ⚠️ Điểm cần xem xét / hỏi lại

1. **Circular Dependency:** `AlertsModule` ↔ `TelemetryModule` (Telemetry tạo Alert, Alert cần Device). Cần dùng `forwardRef()` nếu có vòng lặp. **Cần kiểm tra khi build.**

2. **Cooldown cho Speed Alert:** Bạn có muốn giới hạn 1 cảnh báo SPEEDING/phút/thiết bị không? (dùng Redis có sẵn)

3. **Email template:** `alert.hbs` cần tạo file template trong thư mục `src/services/mail/templates/`. Bạn có muốn thiết kế HTML cho email không?

4. **WebSocket auth:** Hiện tại WS gateway không xác thực JWT. Bạn có muốn thêm guard kiểm tra token khi client kết nối WS không?

5. **`s3Key` trong MediaLog:** Hiện tại `StorageService` lưu GNSS media vào bảng `Media` (riêng), không phải `MediaLog`. Cần thống nhất: link `MediaLog.s3Key` từ `Media.s3Key` sau khi upload xong, hoặc để `MediaLogsService` consume Kafka `gnss.media.upload` và tự lưu.
