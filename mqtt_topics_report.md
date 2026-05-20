# Báo Cáo Giao Thức Truyền Tải MQTT (IoT Hardware & Mobile Tracker)

Trong hệ thống này, **cả Thiết bị phần cứng (Hardware IoT)** và **Ứng dụng điện thoại (Mobile App)** đều được coi là một **"Thiết bị Tracking"**. Toàn bộ quá trình truyền tải dữ liệu, nhận lệnh và báo cáo đều được thực hiện **thuần túy 100% qua MQTT Broker (EMQX)**, hoàn toàn không sử dụng REST API hay WebSocket cho thiết bị.

Tất cả các topic đều dùng namespace chung là `gnss/<deviceId>/...` trong đó `<deviceId>` là mã định danh duy nhất (MAC/IMEI/UUID) của mạch phần cứng hoặc điện thoại.

> **QUY ƯỚC VAI TRÒ:**
> - **[PUB]:** Đóng vai trò gửi dữ liệu (Publisher).
> - **[SUB]:** Đóng vai trò lắng nghe và xử lý (Subscriber).

---

## 1. LUỒNG THIẾT BỊ BÁO CÁO (Device/App `[PUB]` ➡️ Server `[SUB]`)
*(Thiết bị/App chủ động sinh dữ liệu và đẩy lên Server)*

### 1.1 Topic: `gnss/<deviceId>/coordinates`
- **Mục đích:** Đẩy toạ độ GPS, tốc độ, góc quay liên tục.
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "lng": 105.804817,          // (Number) Kinh độ
  "lat": 21.028511,           // (Number) Vĩ độ
  "speed": 45.5,              // (Number) Tốc độ hiện tại (km/h)
  "heading": 120.5,           // (Number) Góc quay/Hướng di chuyển (0-360 độ)
  "timestamp": "2023-10-12T10:00:00.000Z" // (String) Thời điểm lấy mẫu (Chuẩn ISO 8601 UTC)
}
```

### 1.2 Topic: `gnss/<deviceId>/alert`
- **Mục đích:** Đẩy cảnh báo khẩn cấp khi có sự cố (Va chạm, Mất tín hiệu, Nhấn nút SOS trên phần cứng hoặc trên màn hình App).
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "type": "SOS_BUTTON",       // (String) Loại sự cố: "GEOFENCE_EXIT", "SPEEDING", "SIGNAL_LOST", "DANGEROUS_OBSTACLE"
  "severity": "CRITICAL",     // (String) Mức độ: "LOW", "MEDIUM", "HIGH", "CRITICAL"
  "message": "Tài xế nhấn nút SOS khẩn cấp", // (String) Lời tựa mô tả
  "lng": 105.804817,          // (Number) Kinh độ tại lúc xảy ra sự cố
  "lat": 21.028511,           // (Number) Vĩ độ tại lúc xảy ra sự cố
  "timestamp": "2023-10-12T10:05:00.000Z" 
}
```

### 1.3 Topic: `gnss/<deviceId>/status`
- **Mục đích:** Báo cáo định kỳ tình trạng sức khỏe của thiết bị (Nhịp tim / Heartbeat) để Server cập nhật trạng thái Online/Offline và các thông số phần cứng.
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "status": "online",         // (String) "online", "offline", hoặc "sleep"
  "batteryLevel": 85,         // (Number) Phần trăm pin còn lại (0-100)
  "cameraStatus": true,       // (Boolean) Trạng thái camera có đang hoạt động tốt không
  "gnssStatus": true          // (Boolean) Trạng thái chip GPS có đang bắt được sóng không
}
```

### 1.4 Topic: `gnss/<deviceId>/image` và `gnss/<deviceId>/video`
- **Mục đích:** Gửi file ảnh chụp hoặc video chunk thô.
- **Định dạng:** Raw Binary (Chuỗi Byte nhị phân).
- **Chú ý:** Không dùng JSON cho 2 topic này để tối ưu băng thông. File được đẩy nguyên vẹn (ví dụ `.jpg` hoặc `.mp4`) vào thẳng Topic.

### 1.5 Topic: `gnss/<deviceId>/command/reply`
- **Mục đích:** Gửi gói tin ACK để báo cáo cho Server biết thiết bị đã nhận lệnh điều khiển và xử lý thành công hay thất bại.
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "commandId": "cmd_987654321", // (String) ID của lệnh mà Server gửi xuống
  "status": "SUCCESS",          // (String) "SUCCESS" hoặc "FAILED"
  "errorMessage": null,         // (String) Chi tiết lỗi nếu thất bại
  "timestamp": "2023-10-12T11:00:05.000Z"
}
```

---

## 2. LUỒNG LỆNH ĐIỀU KHIỂN TỪ XA (Server `[PUB]` ➡️ Device/App `[SUB]`)
*(Server đẩy lệnh xuống, thiết bị/App luôn Subscribe các topic này để nghe lệnh và thực thi)*

### 2.1 Topic: `gnss/<deviceId>/command/update_config`
- **Mục đích:** Server yêu cầu thay đổi cấu hình hoạt động nội bộ của thiết bị.
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "commandId": "cmd_config_111",
  "telemetryIntervalSeconds": 5, // (Number) Yêu cầu đổi tần suất gửi GPS thành 5 giây/lần
  "speedLimitKmh": 80,           // (Number) Chỉnh ngưỡng tốc độ phạt nguội
  "enableVideoRecording": true   // (Boolean) Kích hoạt ghi hình nền
}
```

### 2.2 Topic: `gnss/<deviceId>/command/capture_media`
- **Mục đích:** Server ra lệnh yêu cầu camera (của phần cứng hoặc điện thoại) chụp ảnh/quay video và gửi ngược lên ngay lập tức.
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "commandId": "cmd_media_222",
  "mediaType": "IMAGE",         // (String) "IMAGE" hoặc "VIDEO"
  "durationSeconds": 10,        // (Number) Nếu là VIDEO, quay trong 10 giây
  "cameraType": "FRONT"         // (String) Yêu cầu dùng camera "FRONT" (Trước) hoặc "REAR" (Sau)
}
```

### 2.3 Topic: `gnss/<deviceId>/command/alarm`
- **Mục đích:** Lệnh kích hoạt loa/còi báo động trực tiếp trên xe (hoặc mở còi hú max volume trên điện thoại).
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "commandId": "cmd_alarm_333",
  "action": "TURN_ON",          // (String) "TURN_ON" hoặc "TURN_OFF"
  "volumeLevel": 100            // (Number) Mức âm lượng còi (0 - 100)
}
```

### 2.4 Topic: `gnss/<deviceId>/command/system`
- **Mục đích:** Lệnh hệ thống cốt lõi *(Chỉ áp dụng cho Hardware IoT, Mobile App nhận được có thể bỏ qua)*.
- **Định dạng:** JSON
- **Cấu trúc Payload:**
```json
{
  "commandId": "cmd_sys_444",
  "action": "REBOOT",           // (String) "REBOOT" (Khởi động lại) hoặc "FACTORY_RESET" (Khôi phục cài đặt gốc)
  "delaySeconds": 5             // (Number) Thực thi lệnh sau 5 giây
}
```

---

## 3. CƠ CHẾ LIVESTREAM VIDEO TRỰC TIẾP (WebRTC P2P)
*(Hệ thống sử dụng công nghệ WebRTC để giám sát camera trực tiếp với độ trễ siêu thấp dưới 1 giây. Giao thức MQTT không được sử dụng để truyền luồng Video trực tiếp nhằm tránh nghẽn băng thông, mà chỉ đóng vai trò truyền tín hiệu điều khiển).*

- **Khởi tạo luồng (Trigger):** Server gửi lệnh MQTT (`gnss/<deviceId>/command/start_stream`) yêu cầu thiết bị/App khởi động Camera.
- **Bắt tay kết nối (Signaling):** Thiết bị và Web Dashboard tiến hành trao đổi các gói tin giao thức SDP và ICE Candidate để dò tìm địa chỉ IP của nhau. Máy chủ sử dụng STUN Server để hỗ trợ xuyên thủng tường lửa mạng NAT/4G.
- **Truyền tải dữ liệu (P2P Streaming):** Sau khi bắt tay thành công, kết nối WebRTC được thiết lập trực tiếp giữa Thiết bị (App/IoT) và Trình duyệt Web của người quản lý thông qua giao thức UDP. Luồng video được truyền ở dạng Peer-to-Peer, giúp giảm tải hoàn toàn băng thông cho Server trung tâm và đảm bảo tính thời gian thực.
