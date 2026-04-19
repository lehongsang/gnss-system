# 📡 MQTT Gateway

This document describes how the system ingests real-time telemetry from GNSS devices via **MQTT**, bridges the data into **Apache Kafka**, and routes it to the appropriate downstream services.

---

## 🏗️ Architecture Overview

```
┌─────────────┐        ┌───────────────────┐        ┌──────────────────────────────┐
│  GNSS Device│        │   MQTT Broker     │        │         Kafka Topics         │
│  / Camera   │──────▶│  (EMQX / Mosquitto)│──────▶│  gnss.coordinates            │
│             │  MQTT  │                   │  Bridge│  gnss.alerts                 │
└─────────────┘        └───────────────────┘        │  gnss.media.upload           │
                                                    └──────────┬───────────────────┘
                                                               │
                           ┌───────────────────────────────────┼───────────────────┐
                           ▼                                   ▼                   ▼
                  ┌────────────────┐                ┌──────────────────┐  ┌────────────────┐
                  │  GNSS Service  │                │  Alert Service   │  │ Storage Service│
                  │ (coordinates)  │                │  (cảnh báo)      │  │ (image/video)  │
                  └────────────────┘                └──────────────────┘  └────────────────┘
```

### Phân luồng dữ liệu

| Loại dữ liệu | Giao thức | Kafka Topic | Consumer |
|:---|:---|:---|:---|
| Tọa độ GPS (lng, lat) | MQTT → Kafka | `gnss.coordinates` | `GnssService` |
| Cảnh báo (alert) | MQTT → Kafka | `gnss.alerts` | `AlertService` |
| Hình ảnh / Video | MQTT → Kafka | `gnss.media.upload` | `StorageService` |

---

## ⚙️ Cấu hình MQTT

### MQTT Broker

Hệ thống sử dụng **EMQX** (hoặc Mosquitto) làm MQTT broker. Kết nối được đặt trong `MqttModule`.

- **Integration**: `src/services/mqtt/mqtt.service.ts`
- **Module**: `src/services/mqtt/mqtt.module.ts`
- **Library**: [`mqtt`](https://www.npmjs.com/package/mqtt) hoặc NestJS Microservices MQTT transport

### Environment Variables

```env
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_CLIENT_ID=gnss-gateway
MQTT_USERNAME=gnss_user
MQTT_PASSWORD=gnss_password
MQTT_PROTOCOL=mqtt
# Nếu dùng TLS:
# MQTT_PROTOCOL=mqtts
# MQTT_PORT=8883
```

---

## 📨 MQTT Topics (thiết bị → broker)

| MQTT Topic | Mô tả | Payload |
|:---|:---|:---|
| `gnss/{deviceId}/coordinates` | Tọa độ GPS realtime | JSON `{ lng, lat, speed, heading, timestamp }` |
| `gnss/{deviceId}/alert` | Cảnh báo từ thiết bị | JSON `{ type, severity, message, timestamp }` |
| `gnss/{deviceId}/image` | Hình ảnh từ camera | Binary (JPEG/PNG) hoặc Base64 |
| `gnss/{deviceId}/video` | Đoạn video ngắn | Binary (MP4) hoặc chunked Base64 |

---

## 🛠️ MqttService

### Khởi tạo & Subscribe

```typescript
// src/services/mqtt/mqtt.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { KafkaService } from '@/services/kafka/kafka.service';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;

  constructor(private readonly kafkaService: KafkaService) {}

  async onModuleInit() {
    this.client = mqtt.connect({
      host: process.env.MQTT_HOST,
      port: Number(process.env.MQTT_PORT),
      clientId: process.env.MQTT_CLIENT_ID,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });

    this.client.on('connect', () => {
      // Subscribe toàn bộ topic gnss
      this.client.subscribe('gnss/+/coordinates');
      this.client.subscribe('gnss/+/alert');
      this.client.subscribe('gnss/+/image');
      this.client.subscribe('gnss/+/video');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });
  }

  async onModuleDestroy() {
    this.client?.end();
  }

  private async handleMessage(topic: string, payload: Buffer) {
    const segments = topic.split('/');
    const deviceId = segments[1];
    const dataType = segments[2];

    switch (dataType) {
      case 'coordinates':
        await this.forwardCoordinates(deviceId, payload);
        break;
      case 'alert':
        await this.forwardAlert(deviceId, payload);
        break;
      case 'image':
      case 'video':
        await this.forwardMedia(deviceId, dataType, payload);
        break;
    }
  }
}
```

---

## 📍 Luồng 1: Tọa độ GPS

Dữ liệu tọa độ được forward đến Kafka topic `gnss.coordinates` để `GnssService` xử lý và lưu lịch sử vị trí.

### Payload từ thiết bị

```json
{
  "lng": 106.6958,
  "lat": 10.7769,
  "speed": 45.5,
  "heading": 270,
  "altitude": 12.0,
  "accuracy": 2.5,
  "timestamp": "2026-04-16T09:00:00.000Z"
}
```

### Bridge MQTT → Kafka

```typescript
private async forwardCoordinates(deviceId: string, payload: Buffer) {
  const data = JSON.parse(payload.toString());
  await this.kafkaService.produce('gnss.coordinates', [
    {
      key: deviceId,
      value: {
        deviceId,
        lng: data.lng,
        lat: data.lat,
        speed: data.speed,
        heading: data.heading,
        altitude: data.altitude,
        timestamp: data.timestamp,
      },
    },
  ]);
}
```

### Consumer (GnssService)

```typescript
// src/modules/gnss/gnss.service.ts
async onModuleInit() {
  await this.kafkaService.consume(
    'gnss.coordinates',
    'gnss-coordinates-group',
    async ({ message }) => {
      const payload = JSON.parse(message.value.toString());
      await this.coordinateRepo.save({
        deviceId: payload.deviceId,
        location: () =>
          `ST_SetSRID(ST_MakePoint(${payload.lng}, ${payload.lat}), 4326)`,
        speed: payload.speed,
        heading: payload.heading,
        timestamp: new Date(payload.timestamp),
      });
    },
  );
}
```

---

## 🚨 Luồng 2: Cảnh báo (Alert)

Cảnh báo từ thiết bị (vượt tốc độ, va chạm, thoát vùng địa lý...) được đẩy vào Kafka topic `gnss.alerts`.

### Payload từ thiết bị

```json
{
  "type": "SPEEDING",
  "severity": "HIGH",
  "message": "Vận tốc vượt ngưỡng cho phép (120 km/h)",
  "lng": 106.6958,
  "lat": 10.7769,
  "timestamp": "2026-04-16T09:01:00.000Z"
}
```

### Bridge MQTT → Kafka

```typescript
private async forwardAlert(deviceId: string, payload: Buffer) {
  const data = JSON.parse(payload.toString());
  await this.kafkaService.produce('gnss.alerts', [
    {
      key: deviceId,
      value: {
        deviceId,
        type: data.type,
        severity: data.severity,
        message: data.message,
        location: { lng: data.lng, lat: data.lat },
        timestamp: data.timestamp,
      },
    },
  ]);
}
```

### Consumer (AlertService)

```typescript
// src/modules/alerts/alert.service.ts
async onModuleInit() {
  await this.kafkaService.consume(
    'gnss.alerts',
    'gnss-alerts-group',
    async ({ message }) => {
      const payload = JSON.parse(message.value.toString());
      // Lưu cảnh báo vào DB
      await this.alertRepo.save({
        deviceId: payload.deviceId,
        type: payload.type,
        severity: payload.severity,
        message: payload.message,
        lng: payload.location.lng,
        lat: payload.location.lat,
        timestamp: new Date(payload.timestamp),
      });
      // Push realtime đến client qua WebSocket / Notification
      await this.notificationService.push(payload);
    },
  );
}
```

---

## 🎥 Luồng 3: Hình ảnh / Video → Storage

Media từ camera gắn thiết bị được forward đến Kafka topic `gnss.media.upload`, sau đó được xử lý bởi `StorageService` và lưu vào **SeaweedFS/S3**.

> [!IMPORTANT]
> Hình ảnh và video **không** đi qua luồng tọa độ hay cảnh báo. Chúng được lưu về **Storage** riêng biệt theo cơ chế bất đồng bộ để tránh block luồng chính.

### Bridge MQTT → Kafka

```typescript
private async forwardMedia(
  deviceId: string,
  mediaType: 'image' | 'video',
  payload: Buffer,
) {
  await this.kafkaService.produce('gnss.media.upload', [
    {
      key: deviceId,
      value: {
        deviceId,
        mediaType,
        // Encode buffer thành Base64 để truyền qua Kafka
        data: payload.toString('base64'),
        mimeType: mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
        timestamp: new Date().toISOString(),
      },
    },
  ]);
}
```

### Consumer (StorageService)

```typescript
// src/services/storage/storage.service.ts — onModuleInit
await this.kafkaService.consume(
  'gnss.media.upload',
  'gnss-media-upload-group',
  async ({ message }) => {
    const payload = JSON.parse(message.value.toString());
    const buffer = Buffer.from(payload.data, 'base64');

    const file: Express.Multer.File = {
      buffer,
      originalname: `${payload.deviceId}-${Date.now()}.${payload.mediaType === 'image' ? 'jpg' : 'mp4'}`,
      mimetype: payload.mimeType,
      size: buffer.length,
    } as Express.Multer.File;

    // Upload lên SeaweedFS, lưu metadata vào DB
    await this.uploadFile(
      file,
      true,
      payload.mediaType === 'image' ? StoragePath.GNSS_IMAGES : StoragePath.GNSS_VIDEOS,
    );
  },
);
```

---

## 📋 Kafka Topics (GNSS)

| Topic | Nguồn | Consumer | Mô tả |
|:---|:---|:---|:---|
| `gnss.coordinates` | `MqttService` | `GnssService` | Tọa độ GPS realtime (lng, lat) |
| `gnss.alerts` | `MqttService` | `AlertService` | Cảnh báo từ thiết bị |
| `gnss.media.upload` | `MqttService` | `StorageService` | Hình ảnh / video từ camera |

---

## 🛠️ Maintenance & Lifecycle

- **`onModuleInit`**: Kết nối đến MQTT broker và đăng ký subscribe các topic.
- **`onModuleDestroy`**: Đóng kết nối MQTT an toàn.
- **QoS**: Khuyến nghị dùng `QoS 1` (at least once) cho tọa độ & cảnh báo; `QoS 0` cho media (chấp nhận mất gói).
- **Reconnect**: Library `mqtt` tự động reconnect theo exponential backoff.

---

## 🔗 Tài liệu liên quan

- [KAFKA.md](./KAFKA.md) — KafkaService & topic management
- [STORAGE.md](./STORAGE.md) — StorageService & media pipeline
- [EXCEPTIONS.md](./EXCEPTIONS.md) — Xử lý lỗi toàn cục
