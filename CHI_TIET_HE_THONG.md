# CHI TIẾT HỆ THỐNG GNSS BACKEND

Tài liệu này trình bày chi tiết về cấu trúc cơ sở dữ liệu, các chức năng hệ thống (đặc biệt là luồng xác thực), và định nghĩa các payload dữ liệu nhận từ thiết bị qua MQTT.

---

## 1. Cơ sở dữ liệu (Database Tables)

Dự án sử dụng PostgreSQL kết hợp với PostGIS để lưu trữ dữ liệu không gian. Hiện tại có tổng cộng 14 bảng, được phân thành 4 nhóm chính:

### 1.1. Bảng cấu hình tĩnh / Dữ liệu gốc
*Ít thay đổi sau khi tạo ban đầu.*
- **`user`**: Lưu thông tin người dùng (id, name, email, phoneNumber, role, mediaId, trạng thái xác thực email, trạng thái ban).
- **`account`**: Lưu thông tin liên kết với OAuth provider (Google, Apple, GitHub).
- **`jwks`**: Quản lý khóa ký cho JWT.
- **`twoFactor`**: Cấu hình bảo mật xác thực 2 bước (2FA).
- **`devices`**: Lưu cấu hình thiết bị GNSS (id, name, macAddress, ownerId, speedLimitKmh).
- **`geofences`**: Lưu các vùng địa lý theo định dạng PostGIS Polygon (`geom`), người tạo.
- **`medias`**: Lưu metadata của các file đã tải lên (ảnh đại diện, v.v.).

### 1.2. Bảng dữ liệu động / Time-series
*Ghi nhận liên tục từ thiết bị, tần suất cao.*
- **`telemetry`**: Lưu trữ lịch sử GPS (lat, lng, speed, heading, timestamp, accuracyStatus). Hỗ trợ PostGIS geometry column để tối ưu tìm kiếm không gian.
- **`alerts`**: Lưu lịch sử cảnh báo (geofence, speed, signal lost...), mức độ, tọa độ diễn ra sự kiện.
- **`media_logs`**: Nhật ký đa phương tiện (ảnh/video) gửi từ camera thiết bị (lưu trữ S3 Key).
- **`device_status`**: Trạng thái heartbeat hiện hành của thiết bị (pin, trạng thái camera, kết nối GNSS). Luôn tự động cập nhật đè (upsert) mỗi khi có trạng thái mới.

### 1.3. Bảng phiên làm việc (Session)
*Dữ liệu tạm thời, có giới hạn thời gian (TTL).*
- **`session`**: Quản lý phiên đăng nhập hiện tại (Token, User-Agent, IP, thời gian hết hạn).
- **`verification`**: Lưu trữ các mã OTP, mã xác minh, reset mật khẩu (có thời hạn).

### 1.4. Bảng trung gian (Join Table)
- **`device_geofence`**: Thiết lập quan hệ N-N (Many-to-Many) giữa Thiết bị và Vùng địa lý.

> **Ghi chú cơ bản Entity:** Phần lớn các bảng động và cấu hình sử dụng `BaseEntity` hỗ trợ tự động gen `id` (UUIDv7), `createdAt`, `updatedAt`, và có cơ chế `deletedAt` (Soft Delete) đối với thiết bị, lịch sử, geofence...

---

## 2. Chi tiết các chức năng hệ thống

### 2.1. Authentication & Authorization (Xác thực & Bảo mật)
Hệ thống sử dụng BetterAuth để xử lý bảo mật toàn diện:

- **Đăng ký tài khoản mới:**
  - Hỗ trợ đăng ký bằng Email & Mật khẩu.
  - **Gửi mã xác minh (OTP):** Hệ thống tạo OTP và gửi qua hệ thống Kafka (`AUTH_MAIL` topic) tới `MailConsumer` để gửi email xác minh. 
  - **Auto-clean Unverified User:** Nếu người dùng đăng ký nhưng chưa xác minh mà thực hiện gửi lại yêu cầu đăng ký, hệ thống tự động xóa account rác cũ để tạo account mới (via BetterAuth before-hook).

- **Đăng nhập đa phương thức:**
  - **Google Login:** Đăng nhập thông qua tài khoản Google (OAuth2). Tự động liên kết tài khoản nếu trùng email.
  - **Apple Login:** Đăng nhập thông qua Apple ID (Apple Sign-In).
  - **Email / Password:** Phương thức truyền thống.
  - **Email OTP (Passwordless):** Đăng nhập thông qua việc nhận một mã OTP gửi qua email thay vì dùng mật khẩu.

- **Bảo mật tăng cường:**
  - **2FA (Xác thực 2 yếu tố):** Cho phép bật 2FA (qua ứng dụng Authenticator - TOTP hoặc qua OTP gửi tới Email).
  - **Quản lý phiên đăng nhập (Multi-Session):** Cho phép một người dùng đăng nhập đồng thời trên nhiều thiết bị và cấp token refresh tự động.
  - **Quên mật khẩu:** Gửi URL hoặc OTP để reset lại mật khẩu thông qua luồng Kafka `send-password-reset`.

- **Phân quyền & Rate Limiting:**
  - Chống spam (Rate Limiting) qua Redis (giới hạn 100 req/phút cho Auth).
  - Phân quyền (RBAC) chặt chẽ giữa Admin và User thông qua `@Roles` decorator.

### 2.2. Quản lý Thiết bị (Devices) & Trạng thái
- **CRUD thiết bị:** Đăng ký MAC Address, gán quyền sở hữu, cập nhật cấu hình tốc độ (`speedLimitKmh`).
- **Heartbeat & Status:** Thiết bị gửi bản tin status, server thực hiện Upsert (update or insert) để luôn giữ trạng thái mới nhất về mức pin, trạng thái camera, tín hiệu. Thông tin này lập tức được Broadcast qua WebSocket (`device-status:update`) cho giao diện web.

### 2.3. Theo dõi & Dữ liệu GPS (Telemetry)
- **Real-time GPS:** Tiếp nhận luồng dữ liệu GPS siêu tốc qua Kafka `gnss.coordinates`. Tọa độ được lưu dưới dạng PostGIS và đồng thời Broadcast lên bản đồ qua WebSocket (`telemetry:update`).
- **Phát hiện vượt tốc độ (Server-side):** Server so sánh vận tốc nhận được với `speedLimitKmh` của thiết bị. Nếu vượt, tự động kích hoạt một alert `SPEEDING`. Có sử dụng Redis để tạo cooldown 60 giây chống spam alert liên tục.
- **Tìm điểm lân cận:** Tính năng Admin cho phép tìm kiếm thiết bị lân cận một tọa độ bằng PostGIS `ST_DWithin`.

### 2.4. Vùng Địa Lý (Geofences)
- **Quản lý Geofence:** Vẽ và tạo vùng địa lý (Polygon) trên bản đồ (lưu GeoJSON -> PostGIS geometry).
- **Gán thiết bị vào vùng:** Link thiết bị vào 1 hoặc nhiều geofence để theo dõi.
- **Kiểm tra vi phạm:** Sử dụng PostGIS `ST_Within` để đối chiếu xem thiết bị đã di chuyển ra khỏi vùng an toàn chưa.

### 2.5. Hệ thống Cảnh báo (Alerts)
- **Tiếp nhận Alert:** Consumer Kafka đọc các alert từ `gnss.alerts` (ví dụ: Geofence Exit, Mất tín hiệu, Có vật cản).
- **Phản hồi thời gian thực:** Lưu vào Database và lập tức thông báo tới chủ sở hữu thông qua WebSocket (`alert:new`).
- **Gửi Email Khẩn Cấp:** Nếu alert thuộc mức nghiêm trọng (`GEOFENCE_EXIT`, `SIGNAL_LOST`, `OBSTACLE`), consumer sẽ kích hoạt dịch vụ Mail để gửi email báo động trực tiếp tới người dùng.

### 2.6. Nhật ký Đa phương tiện (Media Logs)
- Ghi nhận lịch sử gửi ảnh / video từ camera tích hợp trên thiết bị.
- Dữ liệu file được mã hóa Base64 và đẩy lên S3 Object Storage (SeaweedFS), lấy Presigned URL có thời hạn (1 giờ) để người dùng xem/stream an toàn mà không làm rò rỉ file.

---

## 3. Các Interface định nghĩa dữ liệu từ thiết bị qua MQTT

Khi thiết bị đẩy dữ liệu qua giao thức MQTT, `MqttService` sẽ tiếp nhận và validate dựa trên các Interface sau trước khi chuyển đổi sang Kafka Topic tương ứng:

### 3.1. Dữ liệu Tọa độ GPS (`MqttCoordinatesPayload`)
*Topic:* `gnss/{deviceId}/coordinates`
```typescript
export interface MqttCoordinatesPayload {
  lng: number;        // Kinh độ (decimal degrees)
  lat: number;        // Vĩ độ (decimal degrees)
  speed: number;      // Tốc độ di chuyển (km/h)
  heading: number;    // Góc phương vị/hướng di chuyển (0–360 độ)
  timestamp: string;  // Chuỗi thời gian chuẩn ISO 8601 UTC
}
```

### 3.2. Sự kiện Cảnh báo (`MqttAlertPayload`)
*Topic:* `gnss/{deviceId}/alert`
```typescript
export interface MqttAlertPayload {
  type: string;       // Loại cảnh báo (ví dụ: GEOFENCE_EXIT, OVERSPEED, OBSTACLE)
  severity: string;   // Mức độ ưu tiên ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
  message: string;    // Mô tả sự kiện (Human-readable)
  lng: number;        // Kinh độ nơi xảy ra cảnh báo
  lat: number;        // Vĩ độ nơi xảy ra cảnh báo
  timestamp: string;  // Chuỗi thời gian chuẩn ISO 8601 UTC
}
```

### 3.3. Dữ liệu Đa phương tiện (`MqttMediaPayload`)
*Topic:* (Topic gửi file ảnh/video)
```typescript
export interface MqttMediaPayload {
  deviceId: string;   // ID của thiết bị (UUID)
  mediaType: 'image' | 'video'; // Loại media đang gửi
  data: string;       // Dữ liệu nội dung file đã được mã hóa Base64
  mimeType: string;   // Định dạng mime (ví dụ: image/jpeg, video/mp4)
  timestamp: string;  // Chuỗi thời gian chuẩn ISO 8601 UTC
}
```
