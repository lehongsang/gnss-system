# 📬 Kafka Messaging

This project uses **Apache Kafka** for asynchronous communication between services. The `KafkaService` is built using the `kafkajs` library and integrated into the NestJS lifecycle.

---

## 🏗️ Architecture

- **Engine**: [KafkaJS](https://kafka.js.org/)
- **Integration**: `src/services/kafka/kafka.service.ts`
- **Module**: `src/services/kafka/kafka.module.ts`

---

## ✨ Features

- **Producer**: Send messages to any topic with automatic JSON stringification.
- **Consumer**: Subscribe to topics with specified `groupId`.
- **Batch Processing**: Support for `consumeBatch` for high-throughput scenarios.
- **Resiliancy**: 
  - Automatic producer connection on module init.
  - Graceful disconnection on module destroy.
  - Customizable retry strategies for consumers.

---

## 🛠️ Configuration

Key environment variables in `.env`:

```env
KAFKA_HOST=localhost
KAFKA_PORT=9092
KAFKA_CLIENT_ID=nest-base
```

---

## 📟 Example Usage

### 🚀 Producing Messages

```typescript
import { KafkaService } from '@/services/kafka/kafka.service';

@Injectable()
export class MyService {
  constructor(private readonly kafkaService: KafkaService) {}

  async notifyUser(userId: string) {
    await this.kafkaService.produce('user-notifications', [
      {
        value: {
          userId,
          message: 'Welcome to Nest Base!',
          timestamp: new Date().toISOString()
        }
      }
    ]);
  }
}
```

### 📥 Consuming Messages

```typescript
@Injectable()
export class MyConsumer implements OnModuleInit {
  constructor(private readonly kafkaService: KafkaService) {}

  async onModuleInit() {
    await this.kafkaService.consume(
      'user-notifications',
      'notification-group',
      async ({ topic, partition, message }) => {
        const payload = JSON.parse(message.value.toString());
        console.log(`Received notification for user: ${payload.userId}`);
      }
    );
  }
}
```

---

## 📋 Topics List

| Topic | Publisher | Consumer | Description |
| :--- | :--- | :--- | :--- |
| `storage-upload` | `StorageService` | `StorageService` | Asynchronous file uploads to S3/SeaweedFS. |
| `user-registrations` | `AuthService` | `UserService` | Downstream actions after a user signs up. |
| `gnss.coordinates` | `MqttService` | `GnssService` | Realtime GPS coordinates (lng, lat) bridged from MQTT. |
| `gnss.alerts` | `MqttService` | `AlertService` | Device alerts (speeding, collision, geo-fence) bridged from MQTT. |
| `gnss.media.upload` | `MqttService` | `StorageService` | Camera images / short video clips bridged from MQTT → routed to Storage. |

---

## 🔄 MQTT → Kafka Bridge

The `MqttService` acts as an **ingestion gateway**: it subscribes to all `gnss/+/*` topics on the MQTT broker and immediately produces messages into the appropriate Kafka topics, decoupling device communication from business logic.

```
MQTT Broker
  gnss/{id}/coordinates  ──▶  Kafka: gnss.coordinates  ──▶  GnssService
  gnss/{id}/alert        ──▶  Kafka: gnss.alerts        ──▶  AlertService
  gnss/{id}/image        ──▶  Kafka: gnss.media.upload  ──▶  StorageService
  gnss/{id}/video        ──▶  Kafka: gnss.media.upload  ──▶  StorageService
```

See [MQTT.md](./MQTT.md) for the full gateway specification.

---

## ⚙️ Maintenance & Lifecycle

The `KafkaService` handles connection lifecycle automatically:
- **`onModuleInit`**: Connects the global producer.
- **`onModuleDestroy`**: Disconnects the producer and all active consumers.
