# MQTT Device Provisioning - FE Notes

## Scope

Phase 1 adds MQTT username/password authentication and per-device ACL without TLS.
TLS will be added later for public deployment.

## Device Creation Flow

1. FE calls `POST /api/devices` with the existing create-device payload.
2. Backend creates the device record and generates MQTT credentials.
3. Backend returns the device plus a one-time `mqttCredentials` object.
4. FE shows the credentials as JSON/QR/config for the physical device.
5. The physical device saves this config in persistent storage.
6. On every boot, the device reconnects to EMQX with the saved credentials.

## `POST /api/devices` Response Shape

```json
{
  "device": {
    "id": "0198abcd-0000-7000-8000-000000000000",
    "name": "GNSS Device 01",
    "mqttUsername": "device:0198abcd-0000-7000-8000-000000000000"
  },
  "mqttCredentials": {
    "deviceId": "0198abcd-0000-7000-8000-000000000000",
    "mqttUsername": "device:0198abcd-0000-7000-8000-000000000000",
    "mqttPassword": "shown-only-once",
    "mqttHost": "localhost",
    "mqttPort": 1883,
    "mqttProtocol": "mqtt",
    "topics": {
      "coordinates": "gnss/0198abcd-0000-7000-8000-000000000000/coordinates",
      "status": "gnss/0198abcd-0000-7000-8000-000000000000/status",
      "alert": "gnss/0198abcd-0000-7000-8000-000000000000/alert",
      "image": "gnss/0198abcd-0000-7000-8000-000000000000/image",
      "video": "gnss/0198abcd-0000-7000-8000-000000000000/video",
      "streamStatus": "gnss/0198abcd-0000-7000-8000-000000000000/stream/status",
      "commands": "gnss/0198abcd-0000-7000-8000-000000000000/command/#"
    }
  }
}
```

## FE Changes

- After creating a device, read `response.device` for normal UI data.
- Show `response.mqttCredentials` once on the success screen.
- Provide a copy button and QR code for `mqttCredentials`.
- Warn users that `mqttPassword` is shown only once and must be saved to the physical device.
- Existing device list/detail screens should not expect `mqttPassword`.
- Add a "Regenerate MQTT credentials" action that calls `POST /api/devices/:id/mqtt-credentials/regenerate`.
- Regenerating credentials invalidates the previous MQTT password, so the physical device must be configured again.

## Device MQTT Rules

- Connect with `mqttUsername` and `mqttPassword`.
- Publish only to the returned device-specific data topics.
- Subscribe only to the returned `commands` topic if live stream commands are needed.
- The backend gateway user remains a broker superuser so it can bridge incoming MQTT messages and send commands.
