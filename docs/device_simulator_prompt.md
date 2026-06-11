# Prompt: Xây dựng GNSS Device Simulator (CLI Tool)

> Sao chép toàn bộ nội dung bên dưới và dán vào một phiên AI khác để bắt đầu xây dựng tool.

---

## Yêu cầu tổng quan

Xây dựng một **CLI tool Node.js** giả lập thiết bị GNSS. Tool này **không cần giao diện** — chỉ cần đọc file config, kết nối MQTT, và tự động gửi dữ liệu giả lập (GPS, trạng thái, cảnh báo, media) đến hệ thống backend.

### Luồng sử dụng:

1. Người dùng tạo thiết bị trên giao diện chính (Dashboard) → nhận được `deviceId` và MQTT credentials.
2. Người dùng điền thông tin thiết bị vào file `config.json` (hoặc `.env`).
3. Chạy lệnh `node simulator.js` hoặc `npm start` → Tool tự động kết nối MQTT và bắt đầu gửi dữ liệu.
4. Tool chạy liên tục cho đến khi người dùng nhấn `Ctrl+C`.

---

## 📂 1. Cấu trúc Project

```
device-simulator/
├── config.json          # Cấu hình thiết bị & kết nối (người dùng sửa file này)
├── simulator.js         # Entry point chính
├── src/
│   ├── mqtt-client.js   # Kết nối & quản lý MQTT
│   ├── gps.js           # Mô phỏng tọa độ GPS (random walk, route, manual)
│   ├── heartbeat.js     # Gửi device status định kỳ
│   ├── alerts.js        # Gửi cảnh báo theo kịch bản
│   └── media.js         # Gửi ảnh/video mẫu
├── assets/
│   ├── sample.jpg       # Ảnh mẫu để gửi qua MQTT
│   └── sample.mp4       # Video mẫu để gửi qua MQTT
├── package.json
└── README.md
```

---

## ⚙️ 2. File `config.json`

Đây là file duy nhất người dùng cần sửa. Tất cả thông tin thiết bị lấy từ giao diện chính sau khi tạo thiết bị.

```json
{
  "api": {
    "baseUrl": "https://gnss.sang2004.io.vn"
  },
  "mqtt": {
    "host": "gnss.sang2004.io.vn",
    "port": 1883,
    "protocol": "mqtt",
    "username": "device:019eb0c5-933e-76c9-ae7d-e41348d5cb3c",
    "password": "mqtt_password_123"
  },
  "device": {
    "id": "019eb0c5-933e-76c9-ae7d-e41348d5cb3c",
    "name": "Device A - Tracker"
  },
  "simulation": {
    "mode": "random_walk",
    "startLat": 21.0285,
    "startLng": 105.8542,
    "endLat": 21.0350,
    "endLng": 105.8600,
    "gpsIntervalMs": 2000,
    "heartbeatIntervalMs": 15000,
    "sendMedia": true,
    "mediaIntervalMs": 60000,
    "alertScenario": "random",
    "alertIntervalMs": 30000,
    "deviationEnabled": false,
    "deviationOffsetDeg": 0.003
  }
}
```

### Giải thích các trường config:

| Trường | Mô tả |
|:---|:---|
| `api.baseUrl` | Base URL của backend API (production: `https://gnss.sang2004.io.vn`, local: `http://localhost:3000`) |
| `mqtt.host` | Host MQTT Broker (production: `gnss.sang2004.io.vn`, local: `localhost`) |
| `mqtt.port` | Port MQTT (`1883` cho tcp, `8083` cho websocket) |
| `mqtt.protocol` | `"mqtt"` (tcp) hoặc `"ws"` (websocket) |
| `mqtt.username` | Chuỗi `"device:<deviceId>"` — lấy từ Dashboard khi tạo thiết bị |
| `mqtt.password` | Mật khẩu MQTT của thiết bị — lấy từ Dashboard khi tạo thiết bị |
| `device.id` | UUID của thiết bị — lấy từ Dashboard |
| `device.name` | Tên thiết bị dùng hiển thị |
| `simulation.mode` | Chế độ GPS: `"random_walk"`, `"route"` (A→B), `"static"` (đứng yên) |
| `simulation.startLat/Lng` | Tọa độ bắt đầu (mặc định khu vực Hà Nội) |
| `simulation.endLat/Lng` | Tọa độ kết thúc (chỉ dùng cho mode `"route"`) |
| `simulation.gpsIntervalMs` | Chu kỳ gửi tọa độ GPS (ms). Mặc định: 2000 (2 giây) |
| `simulation.heartbeatIntervalMs` | Chu kỳ gửi heartbeat (ms). Mặc định: 15000 (15 giây) |
| `simulation.sendMedia` | `true` = tự động tải lên ảnh/video mẫu định kỳ qua luồng HTTP Presigned URL |
| `simulation.mediaIntervalMs` | Chu kỳ gửi media (ms). Mặc định: 60000 (1 phút) |
| `simulation.alertScenario` | Kịch bản alert: `"random"` (ngẫu nhiên), `"speeding"`, `"none"` (không gửi) |
| `simulation.alertIntervalMs` | Chu kỳ gửi alert (ms). Mặc định: 30000 (30 giây) |
| `simulation.deviationEnabled` | `true` = cố tình lệch tuyến để test Route Deviation |
| `simulation.deviationOffsetDeg` | Độ lệch (degree) khi deviation enabled |

---

## 📡 3. Xác thực MQTT

Hệ thống GNSS sử dụng **EMQX HTTP Authentication**. Khi thiết bị kết nối MQTT, EMQX gọi callback `POST /api/mqtt/auth` đến backend để xác thực.

- **Username** có dạng: `device:<UUID-của-thiết-bị>`
- **Password**: Mật khẩu MQTT được tạo khi đăng ký thiết bị trên Dashboard.
- Nếu sai credentials → EMQX từ chối kết nối (connection refused).

### ACL (Access Control List)

Mỗi thiết bị chỉ được phép publish lên các topic của chính nó và subscribe nhận lệnh điều khiển:

| Quyền | Topic |
|:---|:---|
| Publish | `gnss/{deviceId}/coordinates` |
| Publish | `gnss/{deviceId}/status` |
| Publish | `gnss/{deviceId}/alert` |
| Publish | `gnss/{deviceId}/stream/status` |
| Subscribe | `gnss/{deviceId}/command/#` |

*(Lưu ý: Luồng truyền tải file ảnh và video lớn đã được tối ưu hóa chạy qua HTTP Presigned S3 URL trực tiếp, không đi qua MQTT để tránh quá tải Broker).*

---

## 📨 4. MQTT Topics & HTTP API Payloads

### 4.1. Tọa độ GPS — `gnss/{deviceId}/coordinates` (MQTT)

- **QoS**: 1
- **Tần suất**: Theo `gpsIntervalMs` trong config

```json
{
  "lng": 105.8542,
  "lat": 21.0285,
  "speed": 45.5,
  "heading": 270,
  "timestamp": "2026-06-10T09:00:00.000Z"
}
```

| Trường | Kiểu | Mô tả |
|:---|:---|:---|
| `lng` | `number` | Kinh độ (decimal degrees) |
| `lat` | `number` | Vĩ độ (decimal degrees) |
| `speed` | `number` | Tốc độ km/h (tự tính từ khoảng cách 2 điểm liên tiếp) |
| `heading` | `number` | Hướng di chuyển 0-360° (tự tính từ hướng 2 điểm liên tiếp) |
| `timestamp` | `string` | ISO 8601 UTC (dùng `new Date().toISOString()`) |

### 4.2. Trạng thái thiết bị — `gnss/{deviceId}/status` (MQTT)

- **QoS**: 1
- **Tần suất**: Theo `heartbeatIntervalMs` trong config

```json
{
  "status": "online",
  "batteryLevel": 85,
  "cameraStatus": true,
  "gnssStatus": true,
  "satellitesTracked": 12,
  "signalStrength": 95
}
```

| Trường | Kiểu | Giá trị hợp lệ |
|:---|:---|:---|
| `status` | `string` | `"online"`, `"offline"`, `"maintenance"` |
| `batteryLevel` | `number` | 0-100 (mô phỏng: giảm dần 1% mỗi lần heartbeat) |
| `cameraStatus` | `boolean` | Luôn `true` khi đang chạy |
| `gnssStatus` | `boolean` | Luôn `true` khi đang chạy |
| `satellitesTracked` | `number` | Random 8-14 |
| `signalStrength` | `number` | Random 70-100 |

### 4.3. Cảnh báo — `gnss/{deviceId}/alert` (MQTT)

- **QoS**: 1
- **Tần suất**: Theo `alertIntervalMs` hoặc event-driven

```json
{
  "type": "speeding",
  "severity": "HIGH",
  "message": "Vận tốc vượt ngưỡng cho phép (120 km/h)",
  "lng": 105.8542,
  "lat": 21.0285,
  "timestamp": "2026-06-10T09:01:00.000Z",
  "snapshotId": "alert-snap-001"
}
```

| Trường | Giá trị hợp lệ cho `type` |
|:---|:---|
| `type` | `"speeding"`, `"dangerous_obstacle"`, `"signal_lost"`, `"geofence_exit"`, `"geofence_entry"`, `"trajectory_deviation"` |
| `severity` | `"LOW"`, `"MEDIUM"`, `"HIGH"`, `"CRITICAL"` |
| `snapshotId` | Tùy chọn — ID liên kết với ảnh nếu muốn đính kèm |

### 4.4. Quy trình tải lên Media (Hình ảnh & Video) bằng HTTP Presigned URL

Đối với hình ảnh (`assets/sample.jpg`) và video (`assets/sample.mp4`), simulator **không** gửi trực tiếp qua MQTT mà phải thực hiện theo quy trình 3 bước HTTP để đẩy trực tiếp lên SeaweedFS:

#### Bước 1: Yêu cầu Presigned S3 Upload URL từ Backend
Simulator gửi yêu cầu lấy URL ký sẵn lên API Backend.
*   **API URL:** `{api.baseUrl}/api/media-logs/request-upload-url`
*   **Phương thức:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Basic <base64_encode(username:password)>`
        *   *Với:* `username` là `mqtt.username` (`device:<deviceId>`), và `password` là `mqtt.password`.
*   **Payload gửi đi:**
    ```json
    {
      "deviceId": "019eb0c5-933e-76c9-ae7d-e41348d5cb3c",
      "fileExtension": "jpg" // hoặc "mp4" cho video
    }
    ```
*   **Phản hồi nhận được (HTTP 201):**
    ```json
    {
      "uploadUrl": "https://gnss.sang2004.io.vn/medias/media-logs/019eb0c5-933e-76c9-ae7d-e41348d5cb3c/1781083297276.jpg?AWSAccessKeyId=...",
      "s3Key": "media-logs/019eb0c5-933e-76c9-ae7d-e41348d5cb3c/1781083297276.jpg",
      "mimeType": "image/jpeg",
      "expiresIn": 3600
    }
    ```

#### Bước 2: Tải file dữ liệu nhị phân (Binary) trực tiếp lên SeaweedFS
Simulator dùng URL `uploadUrl` vừa nhận được để PUT file nhị phân của ảnh hoặc video.
*   **API URL:** `<uploadUrl>` nhận được từ Bước 1
*   **Phương thức:** `PUT`
*   **Headers:**
    *   `Content-Type: <mimeType>` nhận từ Bước 1 (ví dụ `image/jpeg` hoặc `video/mp4`)
*   **Body:** Gửi toàn bộ dữ liệu nhị phân thô (Raw Binary Buffer) đọc được từ file local (`assets/sample.jpg` hoặc `assets/sample.mp4`).

#### Bước 3: Xác nhận hoàn tất upload lên Backend
Sau khi tải lên thành công (HTTP 200 từ S3), simulator thông báo cho Backend đăng ký thông tin file vào database để kích hoạt luồng xử lý (Kafka/AI).
*   **API URL:** `{api.baseUrl}/api/media-logs/confirm-upload`
*   **Phương thức:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Authorization: Basic <base64_encode(username:password)>` (sử dụng thông tin xác thực thiết bị giống Bước 1)
*   **Payload gửi đi:**
    ```json
    {
      "deviceId": "019eb0c5-933e-76c9-ae7d-e41348d5cb3c",
      "s3Key": "<s3Key_nhận_được_từ_Bước_1>",
      "mediaType": "image", // "image" hoặc "video" tương ứng với loại tệp
      "lat": 21.0285, // Tọa độ hiện tại của thiết bị lúc ghi hình (optional)
      "lng": 105.8542, // (optional)
      "snapshotId": "optional-snapshot-correlation-id" // (optional, ví dụ liên kết với alert)
    }
    ```
*   **Phản hồi nhận được (HTTP 201):** Đối tượng `MediaLog` đã tạo trong DB.

---

## 🧮 5. Thuật toán Mô phỏng GPS

### Mode: `random_walk`
Di chuyển ngẫu nhiên quanh vị trí bắt đầu:
```javascript
let lat = config.simulation.startLat;
let lng = config.simulation.startLng;

function nextPoint() {
  lat += (Math.random() - 0.5) * 0.001;
  lng += (Math.random() - 0.5) * 0.001;
  const speed = Math.random() * 50 + 10; // 10-60 km/h
  const heading = Math.random() * 360;
  return { lat, lng, speed, heading, timestamp: new Date().toISOString() };
}
```

### Mode: `route`
Nội suy tuyến tính từ điểm bắt đầu đến điểm kết thúc:
```javascript
const totalSteps = 100;
let step = 0;

function nextPoint() {
  const t = (step % totalSteps) / totalSteps;
  const currentLat = startLat + (endLat - startLat) * t;
  const currentLng = startLng + (endLng - startLng) * t;
  
  // Tính heading và speed từ 2 điểm liên tiếp
  const heading = Math.atan2(endLng - startLng, endLat - startLat) * 180 / Math.PI;
  const speed = 40 + Math.random() * 20; // 40-60 km/h
  
  step++;
  // Nếu deviationEnabled, thêm offset ngẫu nhiên
  const offset = config.simulation.deviationEnabled 
    ? (Math.random() - 0.5) * config.simulation.deviationOffsetDeg * 2 
    : 0;
  
  return {
    lat: currentLat + offset,
    lng: currentLng + offset,
    speed, heading,
    timestamp: new Date().toISOString()
  };
}
```

### Mode: `static`
Đứng yên tại vị trí bắt đầu, chỉ gửi heartbeat:
```javascript
function nextPoint() {
  return {
    lat: config.simulation.startLat,
    lng: config.simulation.startLng,
    speed: 0,
    heading: 0,
    timestamp: new Date().toISOString()
  };
}
```

---

## 🖥️ 6. Console Output mong muốn

Khi chạy tool, console nên in log rõ ràng để người dùng theo dõi:

```
╔══════════════════════════════════════════════════════╗
║          GNSS Device Simulator v1.0                  ║
╠══════════════════════════════════════════════════════╣
║  Device:    Device A - Tracker                       ║
║  Device ID: 019eb0c5-933e-76c9-ae7d-e41348d5cb3c    ║
║  MQTT Host: gnss.sang2004.io.vn:1883                ║
║  API Host:  https://gnss.sang2004.io.vn              ║
║  Mode:      random_walk                              ║
║  GPS Rate:  every 2s                                 ║
╚══════════════════════════════════════════════════════╝

[09:00:01] ✅ MQTT Connected
[09:00:01] 📡 GPS  → lat: 21.0285, lng: 105.8542, speed: 35 km/h
[09:00:01] 💚 Status → online, battery: 100%
[09:00:03] 📡 GPS  → lat: 21.0288, lng: 105.8545, speed: 42 km/h
[09:00:05] 📡 GPS  → lat: 21.0291, lng: 105.8540, speed: 38 km/h
[09:00:15] 💚 Status → online, battery: 99%
[09:00:30] ⚠️ Alert → speeding (HIGH): Vận tốc vượt ngưỡng
[09:01:00] 📷 Media → Requesting upload URL for sample.jpg
[09:01:01] 📤 Media → Uploading binary to SeaweedFS S3...
[09:01:02] ✅ Media → Upload confirmed! (s3Key: media-logs/019eb0c5-933e-76c9-ae7d-e41348d5cb3c/...)
[09:01:03] 📡 GPS  → lat: 21.0295, lng: 105.8548, speed: 51 km/h
...
[Ctrl+C] 🛑 Shutting down... Sending offline status.
[09:05:00] 💤 Status → offline
[09:05:00] 🔌 MQTT Disconnected. Bye!
```

---

## 🔧 7. Dependencies

```json
{
  "name": "gnss-device-simulator",
  "version": "1.0.0",
  "description": "CLI tool giả lập thiết bị GNSS, đọc config và gửi dữ liệu qua MQTT",
  "main": "simulator.js",
  "scripts": {
    "start": "node simulator.js"
  },
  "dependencies": {
    "mqtt": "^5.15.0"
  }
}
```

Chỉ cần duy nhất thư viện `mqtt`. Không cần framework, không cần UI, không cần Express.

---

## 🔌 8. Lifecycle

1. **Khởi động**: Đọc `config.json` → Validate → In banner.
2. **Kết nối MQTT**: Connect với credentials từ config → Retry nếu thất bại.
3. **Chạy các timer song song**:
   - Timer GPS: Gửi tọa độ mỗi `gpsIntervalMs`.
   - Timer Heartbeat: Gửi status mỗi `heartbeatIntervalMs`.
   - Timer Alert: Gửi cảnh báo mỗi `alertIntervalMs` (nếu `alertScenario !== "none"`).
   - Timer Media: Gửi ảnh/video mẫu mỗi `mediaIntervalMs` (nếu `sendMedia === true`), thực hiện quy trình 3 bước HTTP (request URL → PUT upload → confirm upload).
4. **Graceful Shutdown** (khi nhấn `Ctrl+C`):
   - Gửi 1 heartbeat cuối cùng với `status: "offline"`.
   - Đóng kết nối MQTT.
   - Thoát process.

---

## ✅ 9. Cách sử dụng

```bash
# 1. Clone hoặc tạo project
mkdir device-simulator && cd device-simulator

# 2. Cài đặt
npm install

# 3. Sửa file config.json
#    - Lấy deviceId, mqtt username, mqtt password từ Dashboard sau khi tạo thiết bị

# 4. Chạy
npm start
#  hoặc
node simulator.js

# 5. Mở Dashboard web chính để xem thiết bị:
#    - Thiết bị chuyển sang Online
#    - Vị trí di chuyển realtime trên bản đồ
#    - Media Logs xuất hiện ảnh/video mới
#    - Alerts xuất hiện cảnh báo
```

---

## ✅ 10. Kịch bản kiểm thử đề xuất

### Test 1: Tracking GPS cơ bản
```json
{ "simulation": { "mode": "random_walk", "alertScenario": "none", "sendMedia": false } }
```
→ Mở Dashboard → Xem marker thiết bị di chuyển trên bản đồ.

### Test 2: Gửi cảnh báo
```json
{ "simulation": { "mode": "random_walk", "alertScenario": "random", "alertIntervalMs": 10000 } }
```
→ Mở Dashboard → Xem danh sách Alerts xuất hiện cảnh báo mới mỗi 10 giây.

### Test 3: Upload media
```json
{ "simulation": { "mode": "static", "sendMedia": true, "mediaIntervalMs": 30000 } }
```
→ Mở Dashboard → Vào Media Logs → Xem ảnh/video mới xuất hiện.

### Test 4: Lệch tuyến (Route Deviation)
```json
{ "simulation": { "mode": "route", "deviationEnabled": true, "deviationOffsetDeg": 0.003, "alertScenario": "none" } }
```
1. Trên Dashboard: Tạo Route Plan cho thiết bị → Activate.
2. Chạy simulator với config trên.
3. Backend sẽ tự phát hiện thiết bị đi lệch và tạo alert `trajectory_deviation`.
4. Dashboard hiển thị cảnh báo lệch tuyến realtime.
