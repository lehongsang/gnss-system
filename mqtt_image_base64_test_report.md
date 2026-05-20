# Báo cáo test luồng gửi ảnh qua MQTT bằng Base64

## 1. Mục tiêu

Tài liệu này mô tả cách test luồng thiết bị gửi ảnh camera lên backend qua MQTT, trong đó nội dung ảnh được truyền dưới dạng Base64.

Luồng cần kiểm chứng:

```text
Device / MQTT Client
  -> EMQX MQTT Broker
  -> MqttService subscribe topic gnss/+/image
  -> Kafka topic gnss.media.upload
  -> MediaLogsConsumer
  -> StorageService upload file
  -> MediaLogsService lưu metadata vào database
```

## 2. Thành phần liên quan

| Thành phần | Vai trò |
| :--- | :--- |
| EMQX | MQTT broker nhận publish từ thiết bị |
| `MqttService` | Subscribe `gnss/+/image`, chuẩn hóa payload ảnh và đẩy sang Kafka |
| Kafka topic `gnss.media.upload` | Hàng đợi trung gian cho ảnh/video |
| `MediaLogsConsumer` | Consume Kafka, decode Base64 thành `Buffer`, upload storage và lưu media log |
| SeaweedFS/S3 | Lưu file ảnh sau khi decode |
| Database | Lưu metadata media log |

## 3. Topic MQTT dùng để test

```text
gnss/<deviceId>/image
```

Ví dụ:

```text
gnss/test-device-001/image
```

Trong backend hiện tại, `MqttService` đã subscribe:

```text
gnss/+/image
```

Vì vậy mọi topic đúng cấu trúc `gnss/<deviceId>/image` đều được backend nhận.

## 4. Payload test khuyến nghị

### 4.1. Định dạng đúng cho code hiện tại

Code hiện tại hỗ trợ payload JSON có trường `data` là Base64:

```json
{
  "data": "<BASE64_IMAGE_CONTENT>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-19T07:00:00.000Z"
}
```

Ý nghĩa các field:

| Field | Bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `data` | Có | Chuỗi Base64 của file ảnh, không cần prefix `data:image/jpeg;base64,` |
| `mimeType` | Không | Loại file, mặc định là `image/jpeg` nếu không gửi |
| `timestamp` | Không | Thời điểm chụp ảnh, mặc định là thời điểm backend nhận nếu không gửi |

### 4.2. Lưu ý quan trọng về Base64 thuần

Không nên publish trực tiếp payload chỉ là:

```text
/9j/4AAQSkZJRgABAQAAAQABAAD...
```

Lý do: trong `MqttService.forwardMedia()`, nếu payload không phải JSON hợp lệ thì backend coi toàn bộ payload là binary thô và chạy:

```typescript
data = payload.toString('base64');
```

Nếu đầu vào đã là chuỗi Base64 thuần, backend sẽ Base64-encode lại chuỗi đó. Khi `MediaLogsConsumer` decode một lần, file nhận được sẽ là text Base64 chứ không phải bytes ảnh thật, dẫn tới ảnh lưu ra có thể không mở được.

Vì vậy với yêu cầu test ảnh Base64, payload nên được bọc trong JSON qua field `data`.

## 5. Điều kiện trước khi test

### 5.1. EMQX đang chạy

Kiểm tra các port trong `docker-compose.yml`:

```text
1883  - MQTT TCP
8083  - MQTT over WebSocket
18083 - EMQX Dashboard
```

Dashboard:

```text
http://localhost:18083
```

Thông tin dashboard mặc định trong compose:

```text
admin / public
```

### 5.2. MQTT user hợp lệ

File `.env` backend đang dùng:

```env
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_CLIENT_ID=gnss-gateway
MQTT_USERNAME=gnss_user
MQTT_PASSWORD=gnss_password
MQTT_PROTOCOL=mqtt
```

Nếu EMQX bật Authentication, cần tạo MQTT user:

```text
username: gnss_user
password: gnss_password
```

Lưu ý: `admin/public` chỉ là tài khoản dashboard, không phải MQTT client user.

### 5.3. Backend đã kết nối MQTT và Kafka

Khi chạy backend, log mong đợi:

```text
Connected to MQTT Broker and subscribed to gnss topics
Media Logs Consumer initialized and listening on topic: gnss.media.upload
```

Nếu không có log này, cần kiểm tra lại MQTT, Kafka/Redpanda và các biến môi trường.

## 6. Cách tạo Base64 từ ảnh thật

### 6.1. PowerShell

Ví dụ ảnh test nằm tại:

```text
C:\tmp\test-image.jpg
```

Chạy:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\tmp\test-image.jpg"))
```

Copy toàn bộ output để đưa vào field `data`.

### 6.2. Node.js

```powershell
node -e "const fs=require('fs'); console.log(fs.readFileSync('C:/tmp/test-image.jpg').toString('base64'))"
```

## 7. Test bằng EMQX WebSocket Client

### 7.1. Kết nối WebSocket

Mở:

```text
http://localhost:18083/#/websocket
```

Thông tin kết nối:

```text
Host: localhost
Port: 8083
Path: /mqtt
TLS: false
Protocol Version: MQTT 5 hoặc MQTT 3.1.1
Username: gnss_user
Password: gnss_password
```

Nếu báo `Not authorized`, nguyên nhân thường là MQTT user chưa được tạo trong EMQX Authentication.

### 7.2. Publish message

Topic:

```text
gnss/test-device-001/image
```

Payload:

```json
{
  "data": "<DAN_CHUOI_BASE64_ANH_VAO_DAY>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-19T07:00:00.000Z"
}
```

QoS:

```text
0 hoặc 1
```

Retain:

```text
false
```

## 8. Test bằng script Node.js

Tạo file tạm ngoài repo hoặc chạy trực tiếp bằng Node.js. Ví dụ:

```javascript
const fs = require('fs');
const mqtt = require('mqtt');

const imagePath = 'C:/tmp/test-image.jpg';
const deviceId = 'test-device-001';

const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: `image-test-${Date.now()}`,
  username: 'gnss_user',
  password: 'gnss_password',
});

client.on('connect', () => {
  const payload = {
    data: fs.readFileSync(imagePath).toString('base64'),
    mimeType: 'image/jpeg',
    timestamp: new Date().toISOString(),
  };

  client.publish(
    `gnss/${deviceId}/image`,
    JSON.stringify(payload),
    { qos: 1, retain: false },
    (error) => {
      if (error) {
        console.error('Publish failed:', error);
      } else {
        console.log('Image payload published');
      }
      client.end();
    },
  );
});

client.on('error', (error) => {
  console.error('MQTT error:', error);
});
```

Chạy:

```powershell
node mqtt-image-test.js
```

## 9. Kết quả mong đợi

### 9.1. Ở `MqttService`

Backend nhận message từ topic:

```text
gnss/test-device-001/image
```

Sau đó produce Kafka message vào:

```text
gnss.media.upload
```

Kafka payload nội bộ có dạng:

```json
{
  "deviceId": "test-device-001",
  "mediaType": "image",
  "data": "<BASE64_IMAGE_CONTENT>",
  "mimeType": "image/jpeg",
  "timestamp": "2026-05-19T07:00:00.000Z"
}
```

### 9.2. Ở `MediaLogsConsumer`

Consumer sẽ:

1. Parse Kafka message.
2. Decode `payload.data` bằng `Buffer.from(payload.data, 'base64')`.
3. Tạo filename dạng:

```text
<timestamp>-test-device-001.jpg
```

4. Upload vào folder:

```text
media-logs/test-device-001
```

5. Lưu bản ghi media log với `mediaType = IMAGE_FRAME`.

## 10. Cách kiểm tra sau khi publish

### 10.1. Kiểm tra log backend

Log mong đợi ở consumer:

```text
Processing media upload for device: test-device-001
```

Nếu lỗi decode, upload hoặc database, log sẽ xuất hiện tại `MediaLogsConsumer`.

### 10.2. Kiểm tra database

Tìm bản ghi media log mới theo:

```text
deviceId = test-device-001
mediaType = IMAGE_FRAME
```

Các trường cần có:

```text
deviceId
mediaType
startTime
endTime
s3Key
```

### 10.3. Kiểm tra storage

File ảnh phải được lưu dưới prefix:

```text
media-logs/test-device-001/
```

File sau khi tải về phải mở được bằng trình xem ảnh. Nếu file mở ra là text Base64 hoặc không đọc được, khả năng cao payload đã bị encode hai lần.

## 11. Checklist test

| Bước | Tiêu chí đạt |
| :--- | :--- |
| Connect MQTT | Client kết nối EMQX thành công, không báo `Not authorized` |
| Publish ảnh | Message publish vào `gnss/test-device-001/image` thành công |
| Backend receive | `MqttService` nhận topic `image` |
| Kafka produce | Có message vào `gnss.media.upload` |
| Consumer xử lý | `MediaLogsConsumer` log xử lý device `test-device-001` |
| Storage upload | Có file trong `media-logs/test-device-001` |
| Database lưu metadata | Có bản ghi media log mới |
| File hợp lệ | File tải về mở được, đúng ảnh ban đầu |

## 12. Các lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| `Connection refused: Not authorized` | MQTT user chưa tồn tại hoặc sai password | Tạo `gnss_user/gnss_password` trong EMQX Authentication |
| Backend không nhận message | Sai topic hoặc backend chưa subscribe | Dùng đúng `gnss/<deviceId>/image`, kiểm tra log `MqttService` |
| Ảnh lưu ra bị hỏng | Gửi Base64 thuần làm backend encode lại lần nữa | Gửi JSON có field `data` |
| Consumer không chạy | Kafka/Redpanda chưa sẵn sàng hoặc consumer chưa init | Kiểm tra log `Media Logs Consumer initialized` |
| Upload storage lỗi | SeaweedFS/S3 chưa chạy hoặc sai config | Kiểm tra `StorageService` và container storage |
| Không có record DB | Consumer lỗi sau upload hoặc DB chưa kết nối | Kiểm tra log consumer và database connection |

## 13. Kết luận

Luồng gửi ảnh Base64 qua MQTT hiện tại nên được test bằng payload JSON trên topic `gnss/<deviceId>/image`. Trường `data` chứa Base64 ảnh thật, `mimeType` nên là `image/jpeg` hoặc `image/png`, và `timestamp` nên là ISO 8601.

Với implementation hiện tại, không publish chuỗi Base64 thuần trực tiếp nếu mục tiêu là lưu được ảnh hợp lệ, vì backend sẽ coi payload đó là binary thô và encode Base64 thêm một lần.
