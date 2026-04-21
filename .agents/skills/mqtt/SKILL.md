# 📡 MQTT Gateway - Skill File

Standards for the MQTT ingestion layer: subscribing to device topics, bridging data into Kafka, and managing connection lifecycle.

## 1. Architecture Principles

- **Role**: `MqttService` is an **ingestion gateway only** — it does NOT process business logic.
- **Bridge Pattern**: MQTT message → parse → `kafkaService.produce(KafkaTopic.GNSS_*)`.
- **Decoupling**: All downstream logic (DB save, geofence check, notifications) lives in Kafka consumers.

## 2. Topic Convention

| MQTT Topic Pattern | Data Type | Target Kafka Topic |
|:---|:---|:---|
| `gnss/{deviceId}/coordinates` | JSON `{ lng, lat, speed, heading, altitude, timestamp }` | `KafkaTopic.GNSS_COORDINATES` |
| `gnss/{deviceId}/alert` | JSON `{ type, severity, message, lng, lat, timestamp }` | `KafkaTopic.GNSS_ALERTS` |
| `gnss/{deviceId}/image` | Binary JPEG / Base64 | `KafkaTopic.GNSS_MEDIA_UPLOAD` |
| `gnss/{deviceId}/video` | Binary MP4 / Base64 | `KafkaTopic.GNSS_MEDIA_UPLOAD` |

## 3. Implementation Rules

- **Always** use `KafkaTopic` enum — never raw string literals.
- Parse `deviceId` from topic segment `[1]`: `topic.split('/')[1]`.
- Wrap each `forwardXxx()` in `try-catch` with `Logger.error()`.
- Binary media: encode to Base64 before producing to Kafka (Claim Check not applicable for small frames; for large video, implement Claim Check — upload to S3 first, send only the key).
- Use `QoS 1` for coordinates and alerts; `QoS 0` for media.

## 4. Lifecycle

- **`onModuleInit`**: Connect to MQTT broker, subscribe to `gnss/+/coordinates`, `gnss/+/alert`, `gnss/+/image`, `gnss/+/video`.
- **`onModuleDestroy`**: Call `client?.end()` for graceful shutdown.
- **Auto-reconnect**: The `mqtt` library handles exponential backoff reconnects automatically.

## 5. References

- [MQTT.md](./references/MQTT.md) — Full gateway spec, payload schemas, consumer examples
- [KAFKA.md](../kafka/references/KAFKA.md) — Topic list and KafkaTopic enum
- `src/services/mqtt/mqtt.service.ts` — Implementation
