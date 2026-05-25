# MQTT channels cho thiết bị

## Chủ đề backend subscribe
- `gnss/+/coordinates`
- `gnss/+/alert`
- `gnss/+/status`
- `gnss/+/image`
- `gnss/+/video`
- `gnss/+/stream/status`

## Quy ước chung
- `gnss/<deviceId>/<dataType>`
- `deviceId` là UUID thiết bị

## Luồng user đăng ký/cấp phát thiết bị

Hệ thống hiện dùng cơ chế **user tạo thiết bị trên web trước**, backend sinh `deviceId` và MQTT credentials cho thiết bị. Thiết bị không tự đăng ký qua MQTT và không dùng MAC address làm định danh chính.

### 1. User tạo thiết bị trên web

User đăng nhập web và gọi API tạo thiết bị:

- `POST /api/devices`

Payload tối thiểu:
```json
{
  "name": "GNSS Device 01",
  "speedLimitKmh": 80
}
```

Ghi chú:
- Nếu user thường tạo thiết bị, backend tự gán `ownerId` là user đang đăng nhập.
- Nếu admin tạo hộ, backend có thể nhận `ownerId` để gán thiết bị cho user khác.

### 2. Backend sinh `deviceId` và MQTT credentials

Sau khi tạo record `devices`, backend sinh:

- `deviceId`: UUID của thiết bị.
- `mqttUsername`: dạng `device:<deviceId>`.
- `mqttPassword`: random secret, chỉ trả về một lần.
- `mqtt_password_hash`: hash của password, lưu trong DB; backend không lưu plain password.
- ACL MQTT: thiết bị chỉ được publish/subscribe đúng topic của chính nó.

Response tạo thiết bị:
```json
{
  "device": {
    "id": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
    "name": "GNSS Device 01",
    "mqttUsername": "device:019e4a45-b4aa-74ed-b5c2-484b89b18701"
  },
  "mqttCredentials": {
    "deviceId": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
    "mqttUsername": "device:019e4a45-b4aa-74ed-b5c2-484b89b18701",
    "mqttPassword": "<shown-only-once>",
    "mqttHost": "localhost",
    "mqttPort": 1883,
    "mqttProtocol": "mqtt",
    "topics": {
      "coordinates": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/coordinates",
      "status": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/status",
      "alert": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/alert",
      "image": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/image",
      "video": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/video",
      "streamStatus": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/stream/status",
      "commands": "gnss/019e4a45-b4aa-74ed-b5c2-484b89b18701/command/#"
    }
  }
}
```

### 3. FE hiển thị cấu hình cho thiết bị

FE phải hiển thị `mqttCredentials` ngay sau khi tạo thiết bị:

- Hiển thị `deviceId`.
- Hiển thị `mqttUsername`.
- Hiển thị `mqttPassword`.
- Hiển thị broker dạng `mqtt://<host>:<port>`.
- Hiển thị danh sách topic được phép.
- Có nút sao chép JSON/QR để người dùng nạp vào thiết bị.

Quan trọng:
- `mqttPassword` chỉ hiển thị một lần.
- Nếu user đóng màn hình hoặc mất password, không lấy lại được plain password từ backend.
- Khi đó phải dùng chức năng cấp lại MQTT credentials.

### 4. User nạp cấu hình vào thiết bị

Thiết bị thật cần lưu các thông tin sau vào bộ nhớ bền, ví dụ flash/NVS/EEPROM/config file:

```text
brokerHost=<mqttHost>
brokerPort=<mqttPort>
deviceId=<deviceId>
mqttUsername=<mqttUsername>
mqttPassword=<mqttPassword>
```

Ví dụ local:
```text
brokerHost=localhost
brokerPort=1883
deviceId=019e4a45-b4aa-74ed-b5c2-484b89b18701
mqttUsername=device:019e4a45-b4aa-74ed-b5c2-484b89b18701
mqttPassword=<shown-only-once>
```

Nếu thiết bị thật nằm ngoài máy chạy Docker/backend, `localhost` phải được thay bằng IP LAN hoặc domain public của server, ví dụ:

```text
brokerHost=192.168.1.20
brokerPort=1883
```

### 5. Thiết bị kết nối MQTT

Khi bật nguồn, thiết bị:

1. Đọc cấu hình đã lưu.
2. Kết nối broker MQTT.
3. Đăng nhập bằng `mqttUsername` và `mqttPassword`.
4. Gửi trạng thái ban đầu lên `gnss/<deviceId>/status`.
5. Gửi dữ liệu tọa độ/cảnh báo/media theo các topic được cấp.

Nếu backend/EMQX xác thực thành công, thiết bị được phép publish các topic dữ liệu của chính nó. Nếu sai username/password hoặc publish nhầm `deviceId`, EMQX trả `Not authorized`.

### 6. ACL MQTT của thiết bị

Mỗi thiết bị chỉ được:

- Publish:
  - `gnss/<deviceId>/coordinates`
  - `gnss/<deviceId>/status`
  - `gnss/<deviceId>/alert`
  - `gnss/<deviceId>/image`
  - `gnss/<deviceId>/video`
  - `gnss/<deviceId>/stream/status`
- Subscribe:
  - `gnss/<deviceId>/command/#`

Thiết bị không được publish hoặc subscribe topic của thiết bị khác.

### 7. Cấp lại MQTT credentials

Khi user mất password hoặc nghi ngờ bị lộ secret, FE gọi:

- `POST /api/devices/<deviceId>/mqtt-credentials/regenerate`

Backend sẽ:

- Giữ nguyên `deviceId`.
- Giữ hoặc tạo lại `mqttUsername`.
- Sinh `mqttPassword` mới.
- Ghi đè `mqtt_password_hash` trong DB.
- Trả password mới về FE một lần.

Sau khi regenerate:

- Password cũ hết hiệu lực.
- Thiết bị phải được nạp lại password mới.
- Các màn hình FE cũ đang hiển thị password cũ không còn dùng được.

### 8. Cấu hình local/deploy

Local dev khi backend chạy bằng `task dev` trên máy host:

```hocon
url = "http://host.docker.internal:3000/api/mqtt/auth"
```

Deploy khi backend chạy trong Docker cùng EMQX:

```hocon
url = "http://app:3000/api/mqtt/auth"
```

Broker hiển thị cho thiết bị/FE lấy từ:

```env
MQTT_PUBLIC_HOST=<ip-lan-or-domain>
MQTT_PUBLIC_PORT=1883
MQTT_PUBLIC_PROTOCOL=mqtt
```

Quy tắc hiện tại:
- Không có topic `gnss/device/register/request` trong danh sách backend subscribe hiện tại.
- Không có response đăng ký dạng `gnss/device/register/response/<requestId>`.
- Cấp phát thiết bị thực hiện qua API/web, không phải qua MQTT tự đăng ký.
- `deviceId` không phải secret; bảo mật nằm ở `mqttPassword` và ACL của EMQX.

## Thiết bị publish

### `gnss/<deviceId>/coordinates`
Payload JSON:
```json
{
  "lng": 106.6958,
  "lat": 10.7769,
  "speed": 45.5,
  "heading": 270,
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

### `gnss/<deviceId>/alert`
Payload JSON:
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
Fields:
- `type`: Loại cảnh báo do thiết bị gửi.
  - Hợp lệ: `trajectory_deviation`, `dangerous_obstacle`, `signal_lost`, `geofence_exit`, `geofence_entry`, `speeding`
  - `signal_lost`, `trajectory_deviation`, `dangerous_obstacle`, `speeding` là cảnh báo thiết bị có thể phát hiện và gửi trực tiếp.
  - `geofence_exit` / `geofence_entry` hiện do backend tạo khi phát hiện rời/vào vùng, không bắt buộc thiết bị gửi.
- `severity`: Mức độ cảnh báo.
  - Hợp lệ: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `message`: Nội dung mô tả cảnh báo.
- `lng`, `lat`: Vị trí xảy ra cảnh báo.
- `timestamp`: Thời điểm cảnh báo, ISO 8601 UTC.
- `snapshotId`: ID đối chiếu nếu ảnh/snapshot kèm theo.

### `gnss/<deviceId>/status`
Payload JSON:
```json
{
  "status": "online",
  "batteryLevel": 72,
  "cameraStatus": true,
  "gnssStatus": true,
  "satellitesTracked": 12,
  "signalStrength": 85
}
```
Fields:
- `status`: Trạng thái chung thiết bị.
  - Hợp lệ: `online`, `offline`, `maintenance`
  - `online`: thiết bị hoạt động bình thường.
  - `offline`: thiết bị ngắt kết nối hoặc không khả dụng.
  - `maintenance`: thiết bị đang bảo trì/không hoạt động bình thường.
- `batteryLevel`: Phần trăm pin, giá trị 0-100.
- `cameraStatus`: `true` nếu camera hoạt động, `false` nếu camera không sẵn sàng.
- `gnssStatus`: `true` nếu GNSS hoạt động tốt, `false` nếu GNSS mất kết nối hoặc lỗi.
- `satellitesTracked`: Số vệ tinh GNSS đang theo dõi (nếu thiết bị gửi được).
- `signalStrength`: Độ mạnh tín hiệu GNSS theo phần trăm 0-100.

### `gnss/<deviceId>/image`
Payload JSON:
```json
{
  "data": "<BASE64_IMAGE_CONTENT>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-20T10:02:00.000Z",
  "snapshotId": "snap-001"
}
```

### Luồng gửi ảnh trực tiếp vào SeaweedFS bằng signed URL
Luồng này dùng cho ảnh/snapshot dung lượng lớn. Thiết bị không gửi bytes ảnh qua MQTT; MQTT chỉ dùng để xin URL upload và báo kết quả. Bytes ảnh được `PUT` trực tiếp vào SeaweedFS bằng URL có chữ ký do backend cấp.

#### 1. Thiết bị xin signed URL
Topic thiết bị publish:
- `gnss/<deviceId>/image/upload/request`

Payload JSON:
```json
{
  "requestId": "upload-<uuid>",
  "snapshotId": "snap-001",
  "fileName": "snap-001.jpg",
  "mimeType": "image/jpeg",
  "contentLength": 245760,
  "checksumSha256": "<optional_sha256_hex>",
  "timestamp": "2026-05-20T10:02:00.000Z"
}
```

Fields:
- `requestId`: ID đối chiếu request/response, do thiết bị tạo.
- `snapshotId`: ID snapshot để liên kết với alert hoặc sự kiện liên quan.
- `fileName`: Tên file gốc hoặc tên thiết bị muốn dùng.
- `mimeType`: MIME type ảnh. Ví dụ: `image/jpeg`, `image/png`.
- `contentLength`: Kích thước file theo byte, dùng để backend kiểm tra giới hạn.
- `checksumSha256`: SHA-256 của nội dung file nếu thiết bị tính được.
- `timestamp`: Thời điểm tạo ảnh, ISO 8601 UTC.

#### 2. Backend trả signed URL cho thiết bị
Topic backend publish:
- `gnss/<deviceId>/image/upload/response`

Payload JSON:
```json
{
  "requestId": "upload-<uuid>",
  "snapshotId": "snap-001",
  "uploadUrl": "http://seaweedfs:8333/gnss-images/devices/<deviceId>/snap-001.jpg?X-Amz-Algorithm=...",
  "method": "PUT",
  "headers": {
    "Content-Type": "image/jpeg"
  },
  "objectKey": "devices/<deviceId>/snap-001.jpg",
  "bucket": "gnss-images",
  "expiresAt": "2026-05-20T10:07:00.000Z"
}
```

Error payload:
```json
{
  "requestId": "upload-<uuid>",
  "snapshotId": "snap-001",
  "status": "error",
  "errorCode": "UPLOAD_URL_DENIED",
  "errorMessage": "Invalid content length"
}
```

Fields:
- `uploadUrl`: URL có chữ ký để thiết bị upload trực tiếp vào SeaweedFS S3 API.
- `method`: HTTP method thiết bị phải dùng, mặc định là `PUT`.
- `headers`: Các header bắt buộc phải gửi đúng khi upload.
- `objectKey`: Key của object trong bucket để backend lưu metadata.
- `bucket`: Bucket SeaweedFS chứa ảnh.
- `expiresAt`: Thời điểm URL hết hạn. Thiết bị phải upload trước thời điểm này.

#### 3. Thiết bị upload trực tiếp vào SeaweedFS
Thiết bị gọi HTTP:
```http
PUT <uploadUrl>
Content-Type: image/jpeg

<binary image bytes>
```

Yêu cầu:
- Không gửi ảnh base64 qua MQTT trong luồng này.
- Phải dùng đúng `method` và `headers` backend trả về.
- Nếu upload thất bại hoặc URL hết hạn, thiết bị xin signed URL mới bằng `requestId` mới.
- SeaweedFS trả HTTP `200`, `201`, hoặc `204` được xem là upload thành công.

#### 4. Thiết bị báo kết quả upload
Topic thiết bị publish:
- `gnss/<deviceId>/image/upload/complete`

Payload JSON khi thành công:
```json
{
  "requestId": "upload-<uuid>",
  "snapshotId": "snap-001",
  "bucket": "gnss-images",
  "objectKey": "devices/<deviceId>/snap-001.jpg",
  "mimeType": "image/jpeg",
  "contentLength": 245760,
  "checksumSha256": "<optional_sha256_hex>",
  "uploadedAt": "2026-05-20T10:02:20.000Z"
}
```

Payload JSON khi thất bại:
```json
{
  "requestId": "upload-<uuid>",
  "snapshotId": "snap-001",
  "status": "error",
  "errorCode": "UPLOAD_FAILED",
  "errorMessage": "SeaweedFS returned HTTP 403",
  "failedAt": "2026-05-20T10:02:20.000Z"
}
```

Sau khi nhận `image/upload/complete`, backend kiểm tra object trong SeaweedFS, lưu metadata ảnh và liên kết `snapshotId` với alert/sự kiện nếu có.

### `gnss/<deviceId>/video`
Payload JSON:
```json
{
  "data": "<BASE64_MP4_CONTENT>",
  "mimeType": "video/mp4",
  "timestamp": "2026-05-20T10:03:00.000Z"
}
```

### `gnss/<deviceId>/stream/status`
Payload JSON:
```json
{
  "requestId": "stream-<uuid>",
  "status": "running",
  "rtspUrl": "rtsp://<host>:8554/live/<deviceId>"
}
```
Error payload:
```json
{
  "requestId": "stream-<uuid>",
  "status": "error",
  "errorMessage": "Camera is not available"
}
```

## Backend publish command xuống thiết bị

### `gnss/<deviceId>/command/start_stream`
Payload JSON:
```json
{
  "requestId": "stream-<uuid>",
  "streamType": "rtsp",
  "mediaPath": "device-<deviceId>",
  "durationSeconds": 300
}
```

### `gnss/<deviceId>/command/stop_stream`
Payload JSON:
```json
{
  "requestId": "stream-<uuid>"
}
```
