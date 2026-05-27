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

#### Cơ chế tự động phát hiện ngoại tuyến (Offline Detector Sweeper)
- **Chu kỳ quét**: Mỗi 60 giây, một background service (`OfflineDetectorService`) sẽ tự động quét cơ sở dữ liệu để tìm ra các thiết bị đang có trạng thái `online` nhưng đã không gửi bất kỳ bản ghi tọa độ (`coordinates`) hay cập nhật trạng thái (`status`) nào trong vòng **5 phút** (300 giây).
- **Hành vi**: Thiết bị sẽ bị tự động chuyển sang trạng thái `offline` trong DB và hệ thống sẽ gửi một bản tin cập nhật trạng thái mới nhất tới các client Frontend thông qua WebSocket channel real-time để giao diện lập tiếp phản ánh chính xác trạng thái thiết bị ngoại tuyến.
- **Tính toán tối ưu**: Khoảng thời gian 5 phút được lựa chọn là khoảng thời gian lý tưởng để đảm bảo hạn chế tối đa các cảnh báo ngoại tuyến giả (false alarm) khi thiết bị đi qua vùng mất sóng tạm thời (ví dụ hầm đường bộ, nhà xe, v.v.) hoặc khi broker MQTT (EMQX) thực hiện khởi động lại/ngắt kết nối tạm thời.

#### Quy chuẩn kiểm duyệt dữ liệu đầu vào nghiêm ngặt (Ingestion Payload Validation)
Hệ thống sử dụng lớp tiện ích `PayloadValidator` kết hợp `class-validator` DTO để kiểm tra cấu trúc của mọi bản tin nhận về từ MQTT/Kafka trước khi xử lý:
1. **Bản tin tọa độ (`TelemetryPayloadDto`)**:
   - `deviceId`: Bắt buộc phải là chuỗi định dạng UUID hợp lệ.
   - `lat`: Bắt buộc là số thực hợp lệ thuộc phạm vi vĩ độ `[-90, 90]`.
   - `lng`: Bắt buộc là số thực hợp lệ thuộc phạm vi kinh độ `[-180, 180]`.
   - `speed`: Bắt buộc là số thực lớn hơn hoặc bằng 0 (km/h).
   - `heading`: Bắt buộc là số thực nằm trong khoảng `[0, 360]` độ.
   - `timestamp`: Phải là định dạng ISO 8601 Date String hợp lệ.
2. **Bản tin trạng thái (`DeviceStatusPayloadDto`)**:
   - `deviceId`: Định dạng UUID hợp lệ.
   - `status`: Phải thuộc tập giá trị Enum hợp lệ (`online`, `offline`, `maintenance`).
   - `batteryLevel`: Số thực nằm trong khoảng `[0, 100]`.
   - `cameraStatus` và `gnssStatus`: Kiểu boolean bắt buộc (`true` / `false`).
   - `satellitesTracked`: Số nguyên lớn hơn hoặc bằng 0.
   - `signalStrength`: Số thực nằm trong khoảng `[0, 100]`.
- **An toàn bảo mật**: Các payload sai định dạng hoặc bị chèn ép mã độc (SQL injection, XSS) sẽ bị hệ thống từ chối lưu trữ và ghi log cảnh báo chi tiết, bảo vệ vững chắc tính toàn vẹn của cơ sở dữ liệu.


### Luồng gửi media (ảnh/video) trực tiếp vào S3/SeaweedFS bằng REST Presigned URL (Có Xác Thực & Giới Hạn)
Luồng này dùng cho ảnh/snapshot dung lượng lớn hoặc video clip. Thiết bị không gửi bytes media qua MQTT; thay vào đó, thiết bị sử dụng HTTP REST API để yêu cầu presigned URL, thực hiện upload trực tiếp lên S3/SeaweedFS bằng `PUT`, và gọi REST API để xác nhận hoàn tất.

#### Quy trình gồm 3 bước:

#### 1. Thiết bị yêu cầu signed URL qua REST
Thiết bị thực hiện HTTP request có kèm **HTTP Basic Authentication**:
- **Endpoint**: `POST /api/media-logs/request-upload-url`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Basic <base64(mqttUsername:mqttPassword)>` (Bắt buộc để xác thực danh tính thiết bị và chống spam chéo ID).

**Payload JSON**:
```json
{
  "deviceId": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
  "fileExtension": "jpg",
  "filename": "optional-custom-filename"
}
```

*Ghi chú*:
- `fileExtension` hợp lệ: `jpg`, `jpeg`, `png`, `webp`, `mp4`, `avi`, `mkv`.
- `filename` là tùy chọn. Nếu không truyền, hệ thống sẽ tự động sinh tên dạng `<timestamp>-<deviceId>`.

**Response JSON**:
```json
{
  "uploadUrl": "http://localhost:8333/gnss-images/media-logs/019e4a45-b4aa-74ed-b5c2-484b89b18701/1748310000000-019e4a45-b4aa-74ed-b5c2-484b89b18701.jpg?X-Amz-Algorithm=...",
  "s3Key": "media-logs/019e4a45-b4aa-74ed-b5c2-484b89b18701/1748310000000-019e4a45-b4aa-74ed-b5c2-484b89b18701.jpg",
  "mimeType": "image/jpeg",
  "expiresIn": 3600
}
```

#### 2. Thiết bị upload trực tiếp lên S3 qua presigned URL
Thiết bị thực hiện một request HTTP `PUT` bằng cách sử dụng `uploadUrl` vừa nhận được (Bước này không cần gửi Authorization header vì chữ ký đã được nhúng sẵn trên URL):
```http
PUT <uploadUrl>
Content-Type: image/jpeg

<binary media bytes>
```

*Yêu cầu*:
- Không mã hóa Base64 hay gửi qua MQTT.
- Phải gửi đúng header `Content-Type` khớp với `mimeType` mà backend đã chỉ định.
- S3/SeaweedFS sẽ trả về HTTP `200 OK` (hoặc `201`/`204`) khi upload thành công.

#### 3. Thiết bị xác nhận hoàn tất upload (Confirm Upload)
Sau khi upload thành công lên storage, thiết bị gọi REST API kèm **HTTP Basic Authentication** để thông báo cho backend kiểm tra tệp tin thực tế và tạo media log record trong database:
- **Endpoint**: `POST /api/media-logs/confirm-upload`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Basic <base64(mqttUsername:mqttPassword)>` (Bắt buộc để đối sánh bảo mật).

**Payload JSON**:
```json
{
  "deviceId": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
  "s3Key": "media-logs/019e4a45-b4aa-74ed-b5c2-484b89b18701/1748310000000-019e4a45-b4aa-74ed-b5c2-484b89b18701.jpg",
  "mediaType": "image",
  "snapshotId": "snap-001"
}
```

*Ghi chú bảo mật nghiêm ngặt từ Backend*:
- **Kiểm tra file thật**: Backend sẽ gọi S3 API check xem file đã thực sự tồn tại trong S3 chưa. Nếu chưa upload, backend từ chối confirm và trả lỗi `404 Not Found`.
- **Giới hạn dung lượng**: Enforce size tối đa **10MB** cho ảnh (`image` - tương đương `IMAGE_FRAME` trong DB) và **100MB** cho video (`video` - tương đương `VIDEO_CHUNK` trong DB). Nếu dung lượng vượt hạn mức, backend tự động xóa file trên S3 lập tức và trả lỗi `400 Bad Request`.
- **Mồ côi**: Nếu file được upload thành công nhưng thiết bị không gọi confirm, hệ thống có background sweeper tự động quét và xóa tệp tin S3 mồ côi này sau 24 giờ.
- **Phân loại**: `mediaType` hợp lệ gửi lên là `image` hoặc `video`.
- **Snapshot**: `snapshotId` là tùy chọn, được dùng để liên kết tự động tệp tin đa phương tiện này với cảnh báo có cùng `snapshotId`.

**Response JSON**:
Trả về record `MediaLog` đã được tạo thành công:
```json
{
  "id": "019e4a45-b4aa-74ed-b5c2-484b89b18702",
  "createdAt": "2026-05-27T10:44:18.000Z",
  "updatedAt": "2026-05-27T10:44:18.000Z",
  "deviceId": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
  "mediaType": "image_frame",
  "startTime": "2026-05-27T10:44:18.000Z",
  "endTime": "2026-05-27T10:44:18.000Z",
  "s3Key": "media-logs/019e4a45-b4aa-74ed-b5c2-484b89b18701/1748310000000-019e4a45-b4aa-74ed-b5c2-484b89b18701.jpg",
  "fileUrl": "",
  "snapshotId": "snap-001"
}
```

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
