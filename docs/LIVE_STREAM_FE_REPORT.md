# Live Stream RTSP/WebRTC FE Integration Report

## 1. Muc tieu

Backend da bo sung control plane cho livestream:

```text
Device RTSP H.264
  -> MediaMTX
  -> WebRTC
  -> Frontend
```

Backend khong tra `rtspUrl` cho FE. FE chi nhan:

```text
webrtcUrl
```

MQTT chi dung de dieu khien thiet bi bat/tat stream.

---

## 2. API moi cho FE

### 2.1. Start live stream

```text
POST /api/live-streams/:deviceId/start
```

Body:

```json
{
  "durationSeconds": 300
}
```

`durationSeconds` optional:

```text
min: 30
max: 3600
default: 300
```

Response luc moi start:

```json
{
  "requestId": "stream-7b3f...",
  "deviceId": "019...",
  "status": "starting",
  "webrtcUrl": null,
  "startedAt": "2026-05-20T10:00:00.000Z",
  "expiresAt": "2026-05-20T10:05:00.000Z"
}
```

FE nen hien loading khi `status = starting`.

### 2.2. Get live stream status

```text
GET /api/live-streams/:deviceId/status
```

Response khi thiet bi da bao ready:

```json
{
  "requestId": "stream-7b3f...",
  "deviceId": "019...",
  "status": "ready",
  "webrtcUrl": "http://localhost:8889/device-019.../webrtc",
  "startedAt": "2026-05-20T10:00:00.000Z",
  "expiresAt": "2026-05-20T10:05:00.000Z"
}
```

Response khi fail:

```json
{
  "requestId": "stream-7b3f...",
  "deviceId": "019...",
  "status": "failed",
  "webrtcUrl": null,
  "startedAt": "2026-05-20T10:00:00.000Z",
  "expiresAt": "2026-05-20T10:05:00.000Z",
  "errorMessage": "Camera unavailable"
}
```

### 2.3. Stop live stream

```text
POST /api/live-streams/:deviceId/stop
```

Response:

```json
{
  "requestId": "stream-7b3f...",
  "deviceId": "019...",
  "status": "stopped",
  "webrtcUrl": null,
  "startedAt": "2026-05-20T10:00:00.000Z",
  "expiresAt": "2026-05-20T10:05:00.000Z"
}
```

---

## 3. Status enum FE can xu ly

```ts
type LiveStreamStatus = 'starting' | 'ready' | 'failed' | 'stopped';
```

UI mapping de xuat:

| Status | UI |
| :--- | :--- |
| `starting` | Loading / Dang ket noi camera |
| `ready` | Hien player |
| `failed` | Hien loi va nut thu lai |
| `stopped` | Dong player / hien nut bat live |

---

## 4. FE flow de xem live

```text
1. User bam "Xem live"
2. FE call POST /api/live-streams/:deviceId/start
3. FE poll GET /api/live-streams/:deviceId/status moi 1-2 giay
4. Khi status = ready:
   - mo webrtcUrl bang WebRTC player/client
5. Khi user dong live:
   - FE call POST /api/live-streams/:deviceId/stop
```

Pseudo-code:

```ts
await api.post(`/live-streams/${deviceId}/start`, {
  durationSeconds: 300,
});

const timer = setInterval(async () => {
  const session = await api.get(`/live-streams/${deviceId}/status`);
  if (session.status === 'ready') {
    clearInterval(timer);
    openPlayer(session.webrtcUrl);
  }
  if (session.status === 'failed') {
    clearInterval(timer);
    showError(session.errorMessage);
  }
}, 1500);
```

---

## 5. Player tren FE

### WebRTC

`webrtcUrl` phu hop cho live gan realtime. Tuy nhien cach play tuy thuoc MediaMTX/WebRTC client ma FE chon.

De xuat:

```text
Uu tien WebRTC cho man "Luong Video" live.
```

---

## 6. MQTT contract thiet bi can lam

Backend se publish command:

```text
gnss/<deviceId>/command/start_stream
```

Payload:

```json
{
  "requestId": "stream-7b3f...",
  "streamType": "rtsp",
  "mediaPath": "device-019...",
  "durationSeconds": 300
}
```

Thiet bi can:

1. Bat camera.
2. Phat RTSP H.264.
3. Gui status ve backend.

Topic status:

```text
gnss/<deviceId>/stream/status
```

Payload ready:

```json
{
  "requestId": "stream-7b3f...",
  "status": "ready",
  "rtspUrl": "rtsp://user:pass@device-ip:554/stream1",
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

Payload failed:

```json
{
  "requestId": "stream-7b3f...",
  "status": "failed",
  "errorMessage": "Camera unavailable",
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

Backend se publish stop command:

```text
gnss/<deviceId>/command/stop_stream
```

Payload:

```json
{
  "requestId": "stream-7b3f..."
}
```

---

## 7. MediaMTX local endpoints

Docker Compose da them service:

```text
mediamtx
```

Ports:

```text
8554 - RTSP
8889 - WebRTC
9997 - Control API
```

Backend env optional:

```env
MEDIAMTX_API_URL=http://localhost:9997
MEDIAMTX_WEBRTC_BASE_URL=http://localhost:8889
```

Khi thiet bi gui `rtspUrl`, backend dang ky source vao MediaMTX path:

```text
device-<deviceId>
```

FE se nhan:

```text
http://localhost:8889/device-<deviceId>/webrtc
```

---

## 8. Checklist FE can lam

| Hang muc | Viec can lam |
| :--- | :--- |
| Live button | Goi `POST /api/live-streams/:deviceId/start` |
| Loading state | Poll status khi `starting` |
| Player | Mo `webrtcUrl` khi `ready` |
| Stop button | Goi `POST /api/live-streams/:deviceId/stop` |
| Error state | Hien `errorMessage` khi `failed` |
| Timeout | Tu dong stop/prompt khi qua `expiresAt` |
| Security | Khong can va khong duoc dung `rtspUrl` tren FE |
