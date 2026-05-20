# Chi tiet he thong GNSS Backend

Tai lieu nay mo ta dung theo implementation hien tai cua repo `gnss-system`, tap trung vao:

- Cac topic MQTT thiet bi publish len backend.
- Payload cua tung topic.
- Cach `MqttService` bridge MQTT sang Kafka.
- Consumer nao xu ly Kafka topic nao.
- Du lieu duoc luu vao bang nao va storage nao.
- Cac diem hien tai chua ho tro de tranh test sai.

> Luu y quan trong: trong cac topic `gnss/<deviceId>/...`, `deviceId` nen la UUID cua record trong bang `devices`. Cac luong luu DB nhu telemetry, alerts, device_status, media_logs deu gan voi `device_id`; neu dung chuoi tuy y nhu `test-device-001`, consumer co the loi do khong dung UUID hoac khong co FK device tuong ung.

---

## 1. Kien truc tong quan

Thiet bi giao tiep voi backend qua MQTT broker EMQX. Backend khong xu ly truc tiep nghiep vu trong MQTT callback, ma chuyen message sang Kafka de consumer xu ly bat dong bo.

```text
GNSS Device / Mobile Tracker
  -> MQTT Broker EMQX
  -> MqttService subscribe gnss/+/...
  -> Kafka topic theo tung loai du lieu
  -> Kafka consumer
  -> Database / WebSocket / Email / S3 object storage
```

Backend MQTT service nam tai:

```text
src/services/mqtt/mqtt.service.ts
```

Kafka topic enum nam tai:

```text
src/services/kafka/kafka.enum.ts
```

---

## 2. Cau hinh MQTT

Backend ket noi MQTT bang package `mqtt`.

Bien moi truong:

```env
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_CLIENT_ID=gnss-gateway
MQTT_USERNAME=gnss_user
MQTT_PASSWORD=gnss_password
MQTT_PROTOCOL=mqtt
```

Khi chay bang Docker Compose, service `app` override:

```env
MQTT_HOST=emqx
```

Port EMQX trong `docker-compose.yml`:

```text
1883  - MQTT TCP
8083  - MQTT over WebSocket
8084  - MQTT over secure WebSocket
8883  - MQTT TLS
18083 - EMQX Dashboard
```

Dashboard EMQX mac dinh:

```text
http://localhost:18083
admin / public
```

> `admin/public` la tai khoan dashboard EMQX, khong nhat thiet la MQTT client user. Neu EMQX bat authentication, can tao MQTT user khop voi `MQTT_USERNAME` va `MQTT_PASSWORD`.

---

## 3. Topic MQTT backend dang subscribe

Khi connect thanh cong, `MqttService` subscribe cac topic:

```text
gnss/+/coordinates
gnss/+/alert
gnss/+/status
gnss/+/image
gnss/+/video
```

Quy uoc chung:

```text
gnss/<deviceId>/<dataType>
```

Trong do:

| Thanh phan | Y nghia |
| :--- | :--- |
| `gnss` | Namespace chung cua he thong |
| `<deviceId>` | UUID cua thiet bi trong bang `devices` |
| `<dataType>` | Loai du lieu: `coordinates`, `alert`, `status`, `image`, `video` |

Bang tong hop:

| MQTT topic | Payload tu thiet bi | Kafka topic noi bo | Consumer xu ly | Luu vao |
| :--- | :--- | :--- | :--- | :--- |
| `gnss/<deviceId>/coordinates` | JSON toa do GPS | `gnss.coordinates` | `TelemetryConsumer` | `telemetry` |
| `gnss/<deviceId>/alert` | JSON canh bao | `gnss.alerts` | `AlertsConsumer` | `alerts` |
| `gnss/<deviceId>/status` | JSON heartbeat/status | `gnss.device.status` | `DeviceStatusConsumer` | `device_status` |
| `gnss/<deviceId>/image` | JSON Base64 hoac raw binary anh | `gnss.media.upload` | `MediaLogsConsumer` | S3 + `media_logs` |
| `gnss/<deviceId>/video` | JSON Base64 hoac raw binary MP4 | `gnss.media.upload` | `MediaLogsConsumer` | S3 + `media_logs` |

---

## 4. Luong `coordinates`

### 4.1. MQTT topic

```text
gnss/<deviceId>/coordinates
```

Vi du:

```text
gnss/019decde-b422-77ba-802a-ba8009bbbaab/coordinates
```

### 4.2. Payload thiet bi publish

Payload phai la JSON.

```json
{
  "lng": 106.6958,
  "lat": 10.7769,
  "speed": 45.5,
  "heading": 270,
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

Field:

| Field | Bat buoc | Kieu | Y nghia |
| :--- | :--- | :--- | :--- |
| `lng` | Co | number | Kinh do WGS84, decimal degrees |
| `lat` | Co | number | Vi do WGS84, decimal degrees |
| `speed` | Co | number | Toc do km/h |
| `heading` | Co | number | Huong di chuyen, 0-360 do |
| `timestamp` | Co | string | ISO 8601 UTC |

### 4.3. Kafka message sau khi bridge

`MqttService.forwardCoordinates()` parse JSON va produce vao:

```text
KafkaTopic.GNSS_COORDINATES = gnss.coordinates
```

Message noi bo:

```json
{
  "deviceId": "019decde-b422-77ba-802a-ba8009bbbaab",
  "lng": 106.6958,
  "lat": 10.7769,
  "speed": 45.5,
  "heading": 270,
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

Kafka key:

```text
<deviceId>
```

### 4.4. Xu ly sau Kafka

`TelemetryConsumer` consume `gnss.coordinates` va:

1. Parse Kafka message.
2. Luu vao bang `telemetry`.
3. Set `accuracyStatus = gnss_only` trong code hien tai.
4. Cap nhat cot PostGIS `geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
5. Broadcast WebSocket event telemetry cho client.
6. Kiem tra vuot toc do theo `devices.speedLimitKmh`.
7. Kiem tra geofence exit theo PostGIS.

Bang luu:

```text
telemetry
```

Cot chinh:

```text
device_id
timestamp
lat
lng
speed
heading
accuracy_status
geom
deleted_at
```

### 4.5. Cac field chua ho tro trong `coordinates`

Code hien tai chua luu cac field sau:

```text
hdop
vdop
satellitesUsed
satellitesTotal
altitude
accuracyMeters
```

Neu gui kem trong MQTT payload, backend hien tai se bo qua vi `forwardCoordinates()` chi forward `lng`, `lat`, `speed`, `heading`, `timestamp`.

---

## 5. Luong `alert`

### 5.1. MQTT topic

```text
gnss/<deviceId>/alert
```

Vi du:

```text
gnss/019decde-b422-77ba-802a-ba8009bbbaab/alert
```

### 5.2. Payload thiet bi publish

Payload phai la JSON.

```json
{
  "type": "signal_lost",
  "severity": "CRITICAL",
  "message": "Mat tin hieu GNSS",
  "lng": 106.6958,
  "lat": 10.7769,
  "timestamp": "2026-05-20T10:01:00.000Z",
  "snapshotId": "snap-20260520-0001"
}
```

Field:

| Field | Bat buoc | Kieu | Y nghia |
| :--- | :--- | :--- | :--- |
| `type` | Co | string | Loai canh bao, phai khop `AlertType` |
| `severity` | Co | string | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `message` | Co | string | Noi dung canh bao |
| `lng` | Co | number | Kinh do noi xay ra canh bao |
| `lat` | Co | number | Vi do noi xay ra canh bao |
| `timestamp` | Co | string | ISO 8601 UTC. Hien consumer chua luu field nay vao alert entity, nhung payload Kafka co mang theo |
| `snapshotId` | Khong | string | Correlation ID de link alert voi anh snapshot |

Gia tri `type` hop le theo enum hien tai:

```text
trajectory_deviation
dangerous_obstacle
signal_lost
geofence_exit
speeding
```

### 5.3. Kafka message sau khi bridge

`MqttService.forwardAlert()` produce vao:

```text
KafkaTopic.GNSS_ALERTS = gnss.alerts
```

Message noi bo:

```json
{
  "deviceId": "019decde-b422-77ba-802a-ba8009bbbaab",
  "type": "signal_lost",
  "severity": "CRITICAL",
  "message": "Mat tin hieu GNSS",
  "location": {
    "lng": 106.6958,
    "lat": 10.7769
  },
  "timestamp": "2026-05-20T10:01:00.000Z",
  "snapshotId": "snap-20260520-0001"
}
```

### 5.4. Xu ly sau Kafka

`AlertsConsumer` consume `gnss.alerts` va:

1. Parse Kafka message.
2. Validate `type` theo enum `AlertType`.
3. Neu co `snapshotId`, tim media log anh cung `deviceId` va `snapshotId`.
4. Luu alert vao bang `alerts`.
5. Broadcast WebSocket alert cho owner cua thiet bi.
6. Neu alert thuoc nhom critical va `severity` la `HIGH` hoac `CRITICAL`, gui email.

Nhom alert co the gui email:

```text
geofence_exit
signal_lost
dangerous_obstacle
```

Bang luu:

```text
alerts
```

Cot chinh:

```text
device_id
alert_type
message
lat
lng
snapshot_id
snapshot_media_log_id
is_resolved
createdAt
updatedAt
deleted_at
```

### 5.5. Luu y ve alert tu server

Ngoai alert do thiet bi publish len `gnss/<deviceId>/alert`, server cung co the tu tao alert:

- `speeding`: khi telemetry speed vuot `devices.speedLimitKmh`.
- `geofence_exit`: khi telemetry nam ngoai geofence da gan.

Hai luong nay duoc kich hoat trong `TelemetryConsumer`, khong can thiet bi publish alert rieng.

---

## 6. Luong `status`

### 6.1. MQTT topic

```text
gnss/<deviceId>/status
```

Vi du:

```text
gnss/019decde-b422-77ba-802a-ba8009bbbaab/status
```

### 6.2. Payload thiet bi publish

Payload phai la JSON.

```json
{
  "status": "online",
  "batteryLevel": 72,
  "cameraStatus": true,
  "gnssStatus": true
}
```

Field:

| Field | Bat buoc | Kieu | Y nghia |
| :--- | :--- | :--- | :--- |
| `status` | Co | string | Trang thai hoat dong |
| `batteryLevel` | Co | number | Phan tram pin, 0-100 |
| `cameraStatus` | Co | boolean | Camera co hoat dong hay khong |
| `gnssStatus` | Co | boolean | GNSS receiver co hoat dong hay khong |

Gia tri `status` hop le:

```text
online
offline
maintenance
```

### 6.3. Kafka message sau khi bridge

`MqttService.forwardStatus()` produce vao:

```text
KafkaTopic.GNSS_DEVICE_STATUS = gnss.device.status
```

Message noi bo:

```json
{
  "deviceId": "019decde-b422-77ba-802a-ba8009bbbaab",
  "status": "online",
  "batteryLevel": 72,
  "cameraStatus": true,
  "gnssStatus": true
}
```

### 6.4. Xu ly sau Kafka

`DeviceStatusConsumer` consume `gnss.device.status` va:

1. Validate `status` theo enum `DeviceStatusEnum`.
2. Upsert vao bang `device_status`.
3. Broadcast WebSocket status update.

Bang luu:

```text
device_status
```

Cot chinh:

```text
device_id
status
battery_level
camera_status
gnss_status
updated_at
```

### 6.5. Cac field chua ho tro trong `status`

Dashboard co the dang hien:

```text
HDOP / VDOP
Satellites 12/24
```

Nhung backend hien tai chua co cot va chua forward cac field:

```text
hdop
vdop
satellitesUsed
satellitesTotal
```

Neu thiet bi gui kem cac field nay trong payload `status`, backend hien tai se bo qua.

Ke hoach bo sung sau nay da duoc tach vao:

```text
docs/DASHBOARD_FUTURE_PLAN.md
```

---

## 7. Luong `image`

### 7.1. MQTT topic

```text
gnss/<deviceId>/image
```

Vi du:

```text
gnss/019decde-b422-77ba-802a-ba8009bbbaab/image
```

### 7.2. Payload khuyen nghi: JSON chua Base64

Nen publish JSON co field `data`.

```json
{
  "data": "<BASE64_IMAGE_CONTENT>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-20T10:02:00.000Z",
  "snapshotId": "snap-20260520-0001"
}
```

Field:

| Field | Bat buoc | Kieu | Y nghia |
| :--- | :--- | :--- | :--- |
| `data` | Co neu gui Base64 | string | Noi dung file anh da encode Base64, khong kem prefix `data:image/jpeg;base64,` |
| `mimeType` | Khong | string | Mac dinh `image/jpeg` neu khong gui |
| `timestamp` | Khong | string | Mac dinh thoi diem backend nhan neu khong gui |
| `snapshotId` | Khong | string | Correlation ID de link anh snapshot voi alert |

MIME type nen dung:

```text
image/jpeg
image/png
image/webp
```

Luu y: consumer hien tai dat extension file la `.jpg` cho moi payload `mediaType = image`, ke ca khi `mimeType` la `image/png` hoac `image/webp`.

### 7.3. Payload raw binary

Code hien tai cung ho tro publish raw binary JPEG/PNG truc tiep len topic.

Trong truong hop payload khong parse duoc JSON, backend coi toan bo MQTT payload la bytes goc va encode sang Base64 de dua qua Kafka.

```text
payload MQTT = bytes that cua file anh
```

### 7.4. Khong nen gui Base64 thuan

Khong publish payload chi la chuoi:

```text
/9j/4AAQSkZJRgABAQAAAQABAAD...
```

Ly do: backend se coi chuoi nay la raw binary/text, roi encode Base64 them mot lan nua. Khi consumer decode mot lan, file luu ra se la text Base64 chu khong phai bytes anh that.

Neu dung Base64, bat buoc boc trong JSON:

```json
{
  "data": "<BASE64_IMAGE_CONTENT>"
}
```

### 7.5. Kafka message sau khi bridge

`MqttService.forwardMedia()` produce vao:

```text
KafkaTopic.GNSS_MEDIA_UPLOAD = gnss.media.upload
```

Message noi bo:

```json
{
  "deviceId": "019decde-b422-77ba-802a-ba8009bbbaab",
  "mediaType": "image",
  "data": "<BASE64_IMAGE_CONTENT>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-20T10:02:00.000Z",
  "snapshotId": "snap-20260520-0001"
}
```

### 7.6. Xu ly sau Kafka

`MediaLogsConsumer` consume `gnss.media.upload` va:

1. Parse Kafka message.
2. Decode `payload.data` bang `Buffer.from(payload.data, 'base64')`.
3. Tao filename:

```text
<Date.now()>-<deviceId>.jpg
```

4. Upload raw buffer len S3/SeaweedFS bang `StorageService.uploadRawFile()`.
5. Luu metadata vao bang `media_logs`.
6. Neu co `snapshotId` va media la image, goi `AlertsService.linkSnapshotMedia()` de link anh voi alert cung `snapshotId`.

Object storage key:

```text
media-logs/<deviceId>/<Date.now()>-<deviceId>.jpg
```

Bang luu:

```text
media_logs
```

Gia tri `media_type`:

```text
image_frame
```

---

## 8. Luong `video`

### 8.1. MQTT topic

```text
gnss/<deviceId>/video
```

Vi du:

```text
gnss/019decde-b422-77ba-802a-ba8009bbbaab/video
```

### 8.2. Payload khuyen nghi: JSON chua Base64 MP4

Nen publish JSON co field `data`.

```json
{
  "data": "<BASE64_MP4_CONTENT>",
  "mimeType": "video/mp4",
  "timestamp": "2026-05-20T10:03:00.000Z"
}
```

Field:

| Field | Bat buoc | Kieu | Y nghia |
| :--- | :--- | :--- | :--- |
| `data` | Co neu gui Base64 | string | Noi dung file MP4 da encode Base64 |
| `mimeType` | Khong | string | Mac dinh `video/mp4` neu khong gui |
| `timestamp` | Khong | string | Mac dinh thoi diem backend nhan neu khong gui |
| `snapshotId` | Khong | string | Co the gui, nhung code hien tai chi auto link snapshot voi image, khong link video voi alert |

### 8.3. Payload raw binary

Code hien tai cung ho tro publish raw binary MP4 truc tiep:

```text
payload MQTT = bytes that cua file .mp4
```

Neu payload khong parse duoc JSON, backend se encode bytes nay thanh Base64 roi dua qua Kafka.

### 8.4. Kafka message sau khi bridge

`MqttService.forwardMedia()` produce vao:

```text
KafkaTopic.GNSS_MEDIA_UPLOAD = gnss.media.upload
```

Message noi bo:

```json
{
  "deviceId": "019decde-b422-77ba-802a-ba8009bbbaab",
  "mediaType": "video",
  "data": "<BASE64_MP4_CONTENT>",
  "mimeType": "video/mp4",
  "timestamp": "2026-05-20T10:03:00.000Z"
}
```

### 8.5. Xu ly sau Kafka

`MediaLogsConsumer` xu ly tuong tu image:

1. Decode Base64 thanh Buffer.
2. Tao filename:

```text
<Date.now()>-<deviceId>.mp4
```

3. Upload len S3/SeaweedFS.
4. Luu metadata vao `media_logs`.

Object storage key:

```text
media-logs/<deviceId>/<Date.now()>-<deviceId>.mp4
```

Bang luu:

```text
media_logs
```

Gia tri `media_type`:

```text
video_chunk
```

### 8.6. Luu y ve video

Luong video qua MQTT hien tai la luong upload clip/chunk ngan, khong phai livestream realtime.

Khong nen gui video lon qua MQTT Base64 vi:

- Base64 lam tang dung luong khoang 33%.
- MQTT broker co the gioi han payload size.
- Kafka message se rat lon.
- Xu ly decode/upload co the cham va ton RAM.

Voi video lon, nen dung luong presigned upload URL:

```text
POST /api/media-logs/request-upload-url
PUT  <presigned upload url>
POST /api/media-logs/confirm-upload
```

---

## 9. Media sau khi upload duoc luu o dau

Anh/video tu MQTT khong luu vao PostgreSQL duoi dang binary.

Luu tru that:

```text
SeaweedFS/S3 object storage
```

Metadata:

```text
media_logs
```

Cot chinh cua `media_logs`:

```text
id
device_id
start_time
end_time
media_type
s3_key
file_url
snapshot_id
createdAt
updatedAt
deleted_at
```

Voi image:

```text
media_type = image_frame
s3_key = media-logs/<deviceId>/<timestamp>-<deviceId>.jpg
```

Voi video:

```text
media_type = video_chunk
s3_key = media-logs/<deviceId>/<timestamp>-<deviceId>.mp4
```

`file_url` hien de rong `''` vi he thong uu tien dung presigned URL.

Lay link xem/tai:

```text
GET /api/media-logs/:id/stream
```

API nay dung `s3_key` de tao presigned GET URL thoi han mac dinh 1 gio.

---

## 10. Phan biet `medias` va `media_logs`

He thong hien co 2 nhom media khac nhau.

### 10.1. Bang `medias`

Dung cho file upload thu cong cua user qua Storage API:

```text
GET    /api/storage/files
POST   /api/storage/files/upload
GET    /api/storage/files/:id/download
DELETE /api/storage/files/:id
GET    /api/storage/quota
```

Bang:

```text
medias
```

### 10.2. Bang `media_logs`

Dung cho anh/video tu thiet bi:

```text
GET  /api/media-logs
GET  /api/media-logs/mine
GET  /api/media-logs/:id
GET  /api/media-logs/:id/stream
POST /api/media-logs/request-upload-url
POST /api/media-logs/confirm-upload
```

Bang:

```text
media_logs
```

### 10.3. Luu y hien thi tren man Storage

`GET /api/storage/files` hien chi doc bang `medias`, chua merge bang `media_logs`.

Vi vay anh/video tu MQTT se khong tu dong hien trong man Storage neu frontend chi goi:

```text
GET /api/storage/files
```

Muon hien media thiet bi, frontend can goi:

```text
GET /api/media-logs
GET /api/media-logs/mine
```

Hoac sau nay can mo rong API `/api/storage/files` de merge ca `medias` va `media_logs`.

---

## 11. Dashboard hien tai va du lieu con thieu

API dashboard:

```text
GET /api/dashboard/stats
```

Tra ve:

```json
{
  "totalDevices": 2,
  "onlineDevices": 2,
  "offlineDevices": 0,
  "alerts24h": 2,
  "criticalAlerts": 2,
  "warningAlerts": 0,
  "infoAlerts": 0,
  "telemetryPoints": 872,
  "telemetryRate": "0/min",
  "mediaUsedBytes": 0,
  "mediaTotalBytes": 5368709120
}
```

Trang thai hien tai:

| Field | Trang thai |
| :--- | :--- |
| `totalDevices` | Lay tu DB |
| `onlineDevices` | Lay tu `device_status` |
| `offlineDevices` | Tinh tu total - online |
| `alerts24h` | Lay tu `alerts` trong 24h |
| `criticalAlerts`, `warningAlerts`, `infoAlerts` | Lay tu `alerts` theo nhom type |
| `telemetryPoints` | Count bang `telemetry` |
| `telemetryRate` | Count telemetry trong 1 phut gan nhat |
| `mediaUsedBytes` | Dang fix cung `0` trong code hien tai |
| `mediaTotalBytes` | Lay tu env `DASHBOARD_MEDIA_TOTAL_BYTES`, mac dinh 5 GB |

Chua ho tro:

```text
HDOP / VDOP
satellitesUsed / satellitesTotal
storage usage tinh ca media_logs
device name trong status API
```

Ke hoach bo sung sau:

```text
docs/DASHBOARD_FUTURE_PLAN.md
```

---

## 12. Kafka topics noi bo

Enum Kafka topic hien tai:

```text
auth.mail
auth.mail.dlq
storage.upload
storage.delete
gnss.coordinates
gnss.alerts
gnss.media.upload
gnss.device.status
```

GNSS mapping:

| Kafka topic | Producer | Consumer group | Consumer |
| :--- | :--- | :--- | :--- |
| `gnss.coordinates` | `MqttService.forwardCoordinates()` | `gnss.coordinates.group` | `TelemetryConsumer` |
| `gnss.alerts` | `MqttService.forwardAlert()` | `gnss.alerts.group` | `AlertsConsumer` |
| `gnss.media.upload` | `MqttService.forwardMedia()` | `gnss.media.upload.group` | `MediaLogsConsumer` |
| `gnss.device.status` | `MqttService.forwardStatus()` | `gnss.device.status.group` | `DeviceStatusConsumer` |

---

## 13. Test nhanh bang Node.js

### 13.1. Test coordinates

```javascript
const mqtt = require('mqtt');

const deviceId = '<DEVICE_UUID>';
const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: `coord-test-${Date.now()}`,
  username: 'gnss_user',
  password: 'gnss_password',
});

client.on('connect', () => {
  client.publish(`gnss/${deviceId}/coordinates`, JSON.stringify({
    lng: 106.6958,
    lat: 10.7769,
    speed: 45.5,
    heading: 270,
    timestamp: new Date().toISOString(),
  }), { qos: 1, retain: false }, () => client.end());
});
```

### 13.2. Test status

```javascript
const mqtt = require('mqtt');

const deviceId = '<DEVICE_UUID>';
const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: `status-test-${Date.now()}`,
  username: 'gnss_user',
  password: 'gnss_password',
});

client.on('connect', () => {
  client.publish(`gnss/${deviceId}/status`, JSON.stringify({
    status: 'online',
    batteryLevel: 72,
    cameraStatus: true,
    gnssStatus: true,
  }), { qos: 1, retain: false }, () => client.end());
});
```

### 13.3. Test image Base64

```javascript
const fs = require('fs');
const mqtt = require('mqtt');

const deviceId = '<DEVICE_UUID>';
const imagePath = 'C:/tmp/test-image.jpg';
const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: `image-test-${Date.now()}`,
  username: 'gnss_user',
  password: 'gnss_password',
});

client.on('connect', () => {
  client.publish(`gnss/${deviceId}/image`, JSON.stringify({
    data: fs.readFileSync(imagePath).toString('base64'),
    mimeType: 'image/jpeg',
    timestamp: new Date().toISOString(),
    snapshotId: 'snap-test-001',
  }), { qos: 1, retain: false }, () => client.end());
});
```

### 13.4. Test video Base64

```javascript
const fs = require('fs');
const mqtt = require('mqtt');

const deviceId = '<DEVICE_UUID>';
const videoPath = 'C:/tmp/test-video.mp4';
const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: `video-test-${Date.now()}`,
  username: 'gnss_user',
  password: 'gnss_password',
});

client.on('connect', () => {
  client.publish(`gnss/${deviceId}/video`, JSON.stringify({
    data: fs.readFileSync(videoPath).toString('base64'),
    mimeType: 'video/mp4',
    timestamp: new Date().toISOString(),
  }), { qos: 1, retain: false }, () => client.end());
});
```

---

## 14. Checklist kiem tra end-to-end

### Coordinates

| Buoc | Ky vong |
| :--- | :--- |
| Publish MQTT | Message vao `gnss/<deviceId>/coordinates` |
| MQTT bridge | Produce Kafka `gnss.coordinates` |
| Consumer | Log `Saved + broadcast telemetry` |
| DB | Co row moi trong `telemetry` |
| WebSocket | Client nhan telemetry update |

### Alert

| Buoc | Ky vong |
| :--- | :--- |
| Publish MQTT | Message vao `gnss/<deviceId>/alert` |
| MQTT bridge | Produce Kafka `gnss.alerts` |
| Consumer | Tao alert neu type hop le |
| DB | Co row moi trong `alerts` |
| WebSocket/email | Broadcast alert, email neu critical va severity cao |

### Status

| Buoc | Ky vong |
| :--- | :--- |
| Publish MQTT | Message vao `gnss/<deviceId>/status` |
| MQTT bridge | Produce Kafka `gnss.device.status` |
| Consumer | Upsert `device_status` |
| DB | Row `device_status.device_id = deviceId` duoc update |
| WebSocket | Client nhan device status update |

### Image/video

| Buoc | Ky vong |
| :--- | :--- |
| Publish MQTT | Message vao `gnss/<deviceId>/image` hoac `video` |
| MQTT bridge | Produce Kafka `gnss.media.upload` |
| Consumer | Log `Processing media upload for device` |
| Storage | Co object trong `media-logs/<deviceId>/...` |
| DB | Co row moi trong `media_logs` |
| Stream | `GET /api/media-logs/:id/stream` tra presigned URL |

---

## 15. Loi thuong gap

| Loi | Nguyen nhan thuong gap | Cach xu ly |
| :--- | :--- | :--- |
| MQTT `Not authorized` | Chua tao MQTT user hoac sai password | Tao user `gnss_user/gnss_password` trong EMQX hoac sua env |
| Backend khong nhan message | Sai topic hoac backend chua connect EMQX | Dung dung `gnss/<deviceId>/<dataType>` va kiem tra log connect |
| Consumer khong chay | Kafka/Redpanda chua san sang | Kiem tra log consumer va Kafka UI |
| DB loi UUID | `deviceId` khong phai UUID | Dung UUID trong bang `devices` |
| DB loi FK | `deviceId` khong ton tai trong bang `devices` | Tao device truoc khi test |
| Anh/video bi hong | Gui Base64 thuan, backend encode lan 2 | Boc Base64 trong JSON field `data` |
| Video lon gui that bai | MQTT/Kafka payload qua lon | Dung presigned upload URL thay vi MQTT Base64 |
| Storage page khong hien video MQTT | `/api/storage/files` chi doc bang `medias` | Dung `/api/media-logs` hoac mo rong API sau |

---

## 16. Tom tat topic va payload toi thieu

```text
gnss/<deviceId>/coordinates
```

```json
{
  "lng": 106.6958,
  "lat": 10.7769,
  "speed": 45.5,
  "heading": 270,
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

```text
gnss/<deviceId>/alert
```

```json
{
  "type": "signal_lost",
  "severity": "CRITICAL",
  "message": "Mat tin hieu GNSS",
  "lng": 106.6958,
  "lat": 10.7769,
  "timestamp": "2026-05-20T10:01:00.000Z",
  "snapshotId": "snap-001"
}
```

```text
gnss/<deviceId>/status
```

```json
{
  "status": "online",
  "batteryLevel": 72,
  "cameraStatus": true,
  "gnssStatus": true
}
```

```text
gnss/<deviceId>/image
```

```json
{
  "data": "<BASE64_IMAGE_CONTENT>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-20T10:02:00.000Z",
  "snapshotId": "snap-001"
}
```

```text
gnss/<deviceId>/video
```

```json
{
  "data": "<BASE64_MP4_CONTENT>",
  "mimeType": "video/mp4",
  "timestamp": "2026-05-20T10:03:00.000Z"
}
```

