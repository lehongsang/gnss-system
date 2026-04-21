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
                  │ TelemetryService│               │  AlertsService   │  │ StorageService │
                  │ (coordinates)  │                │  (cảnh báo)      │  │ (image/video)  │
                  └────────────────┘                └──────────────────┘  └────────────────┘
```

### Phân luồng dữ liệu

| Loại dữ liệu | Giao thức | Kafka Topic | Consumer |
|:---|:---|:---|:---|
| Tọa độ GPS (lng, lat) | MQTT → Kafka | `gnss.coordinates` | `TelemetryService` |
| Cảnh báo (alert) | MQTT → Kafka | `gnss.alerts` | `AlertsService` |
| Hình ảnh / Video | MQTT → Kafka | `gnss.media.upload` | `StorageService` |

---

## ⚙️ Cấu hình MQTT

### MQTT Broker

Hệ thống sử dụng **EMQX** (hoặc Mosquitto) làm MQTT broker. Kết nối được đặt trong `MqttModule`.

- **Integration**: `src/services/mqtt/mqtt.service.ts`
- **Module**: `src/services/mqtt/mqtt.module.ts`
- **Library**: [`mqtt`](https://www.npmjs.com/package/mqtt)

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
| `gnss/{deviceId}/coordinates` | Tọa độ GPS realtime | JSON `{ lng, lat, speed, heading, altitude, accuracy, timestamp }` |
| `gnss/{deviceId}/alert` | Cảnh báo từ thiết bị | JSON `{ type, severity, message, lng, lat, timestamp }` |
| `gnss/{deviceId}/image` | Hình ảnh từ camera | Binary (JPEG/PNG) hoặc Base64 |
| `gnss/{deviceId}/video` | Đoạn video ngắn | Binary (MP4) hoặc chunked Base64 |

---

## 🛠️ MqttService

### Khởi tạo & Subscribe

```typescript
// src/services/mqtt/mqtt.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { KafkaService } from '@/services/kafka/kafka.service';
import { KafkaTopic } from '@/services/kafka/kafka.enum';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  onModuleInit() {
    this.client = mqtt.connect({
      host: process.env.MQTT_HOST,
      port: Number(process.env.MQTT_PORT),
      clientId: process.env.MQTT_CLIENT_ID,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });

    this.client.on('connect', () => {
      this.client.subscribe('gnss/+/coordinates');
      this.client.subscribe('gnss/+/alert');
      this.client.subscribe('gnss/+/image');
      this.client.subscribe('gnss/+/video');
      this.logger.log('Connected to MQTT Broker');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload).catch((err: unknown) => {
        this.logger.error(`Error handling message on topic ${topic}`, err);
      });
    });
  }

  onModuleDestroy() {
    this.client?.end();
  }
}
```

---

## 📍 Luồng 1: Tọa độ GPS

Dữ liệu tọa độ được forward đến Kafka topic `gnss.coordinates` để `TelemetryService` xử lý và lưu lịch sử vị trí.

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
  try {
    const data = JSON.parse(payload.toString()) as CoordinatesPayload;
    await this.kafkaService.produce(KafkaTopic.GNSS_COORDINATES, [
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
  } catch (e) {
    this.logger.error(`Failed to parse coordinates: ${(e as Error).message}`);
  }
}
```

### Consumer (TelemetryService)

```typescript
// src/modules/telemetry/telemetry.service.ts
async onModuleInit() {
  await this.kafkaService.consume(
    KafkaTopic.GNSS_COORDINATES,
    'gnss-coordinates-group',
    async ({ message }) => {
      if (!message.value) return;
      const payload = JSON.parse(message.value.toString());
      await this.savePoint(payload.deviceId, {
        lat: payload.lat,
        lng: payload.lng,
        speed: payload.speed,
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

### Consumer (AlertsService)

```typescript
// src/modules/alerts/alerts.service.ts
async onModuleInit() {
  await this.kafkaService.consume(
    KafkaTopic.GNSS_ALERTS,
    'gnss-alerts-group',
    async ({ message }) => {
      if (!message.value) return;
      const payload = JSON.parse(message.value.toString());
      await this.create({
        deviceId: payload.deviceId,
        alertType: payload.type,
        message: payload.message,
        lng: payload.location?.lng ?? null,
        lat: payload.location?.lat ?? null,
      });
    },
  );
}
```

---

## 🎥 Luồng 3: Hình ảnh / Video → Storage

Media từ camera gắn thiết bị được forward đến Kafka topic `gnss.media.upload`, sau đó được xử lý bởi `StorageService` và lưu vào **SeaweedFS/S3**.

> [!IMPORTANT]
> Hình ảnh và video **không** đi qua luồng tọa độ hay cảnh báo. Chúng được lưu về **Storage** riêng biệt theo cơ chế bất đồng bộ để tránh block luồng chính.

### Consumer (StorageService)

```typescript
// src/services/storage/storage.service.ts — onModuleInit
await this.kafkaService.consume(
  KafkaTopic.GNSS_MEDIA_UPLOAD,
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
    await this.uploadFile(
      file,
      true,
      payload.mediaType === 'image' ? StoragePath.GNSS_IMAGES : StoragePath.GNSS_VIDEOS,
    );
  },
);
```

---

## 🛠️ Maintenance & Lifecycle

- **`onModuleInit`**: Kết nối đến MQTT broker và đăng ký subscribe các topic.
- **`onModuleDestroy`**: Đóng kết nối MQTT an toàn.
- **QoS**: Khuyến nghị dùng `QoS 1` (at least once) cho tọa độ & cảnh báo; `QoS 0` cho media (chấp nhận mất gói).
- **Reconnect**: Library `mqtt` tự động reconnect theo exponential backoff.

---

## 🔗 Tài liệu liên quan

- [KAFKA.md](../../kafka/references/KAFKA.md) — KafkaService & topic management
- [STORAGE.md](../../storage/references/STORAGE.md) — StorageService & media pipeline
