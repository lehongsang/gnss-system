# Kế hoạch Phân loại Cảnh báo trên Frontend (FE)

Tài liệu này định nghĩa cách phân loại các cảnh báo (Alert) nhận được từ Backend để hiển thị chính xác trên giao diện người dùng (Dashboard/Map).

## Danh sách Cảnh báo theo Phân loại Nghiệp vụ

### 1. Cảnh báo từ Phần cứng IoT (Hardware-driven Alerts)
*Đây là các cảnh báo do cảm biến vật lý trên thiết bị IoT tự động phát hiện và gửi tín hiệu về qua MQTT.*

*   **`dangerous_obstacle`**:
    *   *Tiêu đề hiển thị:* Phát hiện chướng ngại vật
    *   *Độ nghiêm trọng:* `CRITICAL` / `HIGH`
    *   *Mô tả:* Thiết bị phát hiện vật cản nguy hiểm phía trước bằng cảm biến vật lý (LiDAR, Radar).
*   **`signal_lost`**:
    *   *Tiêu đề hiển thị:* Mất tín hiệu thiết bị
    *   *Độ nghiêm trọng:* `HIGH`
    *   *Mô tả:* Mất hoàn toàn tín hiệu vệ tinh RTK GNSS phần cứng hoặc mất kết nối mạng.

### 2. Cảnh báo do Hệ thống tính toán (Software/System-driven Alerts)
*Đây là các cảnh báo do Backend tự động so sánh tọa độ định vị (GPS Telemetry) gửi về với các cấu hình giám sát để kích hoạt.*

*   **`speeding`**:
    *   *Tiêu đề hiển thị:* Vượt quá tốc độ
    *   *Độ nghiêm trọng:* `MEDIUM`
    *   *Mô tả:* Vận tốc hiện tại vượt quá giới hạn tốc độ thiết lập riêng cho thiết bị đó.
*   **`geofence_exit`**:
    *   *Tiêu đề hiển thị:* Đi ra khỏi Vùng an toàn
    *   *Độ nghiêm trọng:* `HIGH`
    *   *Mô tả:* Thiết bị đi ra khỏi ranh giới địa lý của vùng được phép di chuyển (Allowed Zone).
*   **`geofence_entry`**:
    *   *Tiêu đề hiển thị:* Đi vào Vùng cấm
    *   *Độ nghiêm trọng:* `HIGH`
    *   *Mô tả:* Thiết bị đi vào ranh giới địa lý của vùng cấm di chuyển (Forbidden Zone).
*   **`trajectory_deviation`**:
    *   *Tiêu đề hiển thị:* Lệch quỹ đạo hành trình
    *   *Độ nghiêm trọng:* `MEDIUM`
    *   *Mô tả:* Tọa độ GPS lệch xa hơn mức cho phép (mặc định 50m) so với lộ trình/quỹ đạo đã lên lịch.

### 3. Cảnh báo do Trí tuệ nhân tạo phân tích (AI-driven Alerts)
*Đây là các cảnh báo do AI Worker phân tích luồng chuyển động (Optical Flow) trên video hành trình của thiết bị gửi lên.*

*   **`sudden_motion`**:
    *   *Tiêu đề hiển thị:* Chuyển động đột ngột (AI)
    *   *Độ nghiêm trọng:* `HIGH` / `CRITICAL`
    *   *Mô tả:* Phát hiện xe phanh gấp, tăng tốc đột ngột hoặc va chạm mạnh (tai nạn).
*   **`abnormal_stop`**:
    *   *Tiêu đề hiển thị:* Dừng xe bất thường (AI)
    *   *Độ nghiêm trọng:* `MEDIUM`
    *   *Mô tả:* Phát hiện xe đứng im quá lâu giữa đường trong khi hệ thống đang đánh dấu trạng thái xe đang di chuyển.

---

## Hướng dẫn triển khai cho FE
1.  **Dữ liệu tọa độ**: Tất cả các loại cảnh báo trên (bao gồm cả Nhóm 3 từ AI) đều được Backend gán tọa độ định vị `lat`/`lng` trong payload gửi về (lấy từ dữ liệu telemetry gần nhất của thiết bị nếu thiết bị không gửi kèm tọa độ). FE có thể trực tiếp chấm các cảnh báo này lên bản đồ.
2.  **Bộ lọc danh sách (Filter/Tabs)**: Thiết kế bộ lọc cảnh báo theo 3 nhóm trên (Phần cứng, Hệ thống, AI) để người dùng dễ dàng kiểm soát và truy vết sự cố.
