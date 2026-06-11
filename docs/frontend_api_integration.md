# Tài liệu Tích hợp API cho Frontend (FE) - Media Pins & Upload Location

Tài liệu này hướng dẫn các thay đổi về API liên quan đến tính năng định vị hình ảnh/video (**Media Logs**) để hiển thị ghim (pins) trên bản đồ.

---

## 1. API Xác nhận tải lên Media (`POST /media-logs/confirm-upload`)

API này được dùng để xác nhận một tệp tin (ảnh hoặc video) đã được thiết bị/client tải lên S3 thành công.

*   **URL:** `/api/media-logs/confirm-upload` (hoặc `/media-logs/confirm-upload` tùy base URL)
*   **Method:** `POST`
*   **Authentication:** Device Basic Auth hoặc User Session.
*   **Payload (JSON):** Bổ sung thêm hai thuộc tính tùy chọn `lat` và `lng`.

### JSON Request Body (Gửi lên):
```json
{
  "deviceId": "7c9e6d11-5bb9-4a94-b152-32b4b455df10",
  "s3Key": "media-logs/7c9e6d11-5bb9-4a94-b152-32b4b455df10/1717581600000-device.jpg",
  "mediaType": "image", // Hoặc "video"
  "snapshotId": "alert-snapshot-01", // Tùy chọn

  // --- THUỘC TÍNH MỚI BỔ SUNG ---
  "lat": 10.762622, // Tùy chọn (Vĩ độ - kiểu float/number)
  "lng": 106.660172 // Tùy chọn (Kinh độ - kiểu float/number)
}
```

> [!TIP]
> *   Nếu thiết bị có khả năng lấy và gửi tọa độ địa lý chính xác lúc chụp/quay, FE/Thiết bị nên truyền trực tiếp `lat` và `lng` lên để đạt độ chính xác tối đa.
> *   Nếu không truyền `lat` và `lng`, server sẽ tự động dò tìm vị trí hành trình (`telemetry`) gần nhất của thiết bị đó dựa trên thời gian để tự động điền vào.

---

## 2. API Lấy danh sách điểm ghim Media trên Bản đồ (`GET /media-logs/map-pins`)

API mới dùng để lấy danh sách toàn bộ các file media đã được gắn thẻ vị trí (định vị địa lý) để FE vẽ các điểm ghim (Media Pins) lên bản đồ.

*   **URL:** `/api/media-logs/map-pins`
*   **Method:** `GET`
*   **Authentication:** Yêu cầu đã đăng nhập (User / Admin).
    *   **User thường:** Chỉ nhận lại dữ liệu của các thiết bị mà mình sở hữu.
    *   **Admin:** Nhận dữ liệu của toàn bộ thiết bị (hoặc lọc theo thiết bị cụ thể).
*   **Query Parameters (Tùy chọn lọc):**
    *   `deviceId`: `string` (UUID thiết bị) - Lọc theo thiết bị cụ thể.
    *   `from`: `string` (ISO 8601 Date, ví dụ: `2026-06-01T00:00:00Z`) - Lọc từ thời điểm.
    *   `to`: `string` (ISO 8601 Date, ví dụ: `2026-06-30T23:59:59Z`) - Lọc đến thời điểm.

### JSON Response (Trả về):
Trả về danh sách mảng chứa các đối tượng có thuộc tính `lat` và `lng` khác `null`, được sắp xếp theo thời gian mới nhất trước (`startTime` DESC).

```json
[
  {
    "id": "2d1b8c22-0ff2-4c3e-8a1f-ef079c6d59b2",
    "createdAt": "2026-06-05T10:22:25.123Z",
    "updatedAt": "2026-06-05T10:22:25.123Z",
    "deviceId": "7c9e6d11-5bb9-4a94-b152-32b4b455df10",
    "startTime": "2026-06-05T10:22:25.000Z",
    "endTime": "2026-06-05T10:22:25.000Z",
    "mediaType": "image_frame", // "image_frame" (ảnh) hoặc "video_chunk" (video)
    "s3Key": "media-logs/7c9e6d11-5bb9-4a94-b152-32b4b455df10/1717581600000-device.jpg",
    "fileUrl": "",
    "snapshotId": null,
    "lat": 10.762622,
    "lng": 106.660172
  },
  {
    "id": "8f9a2b11-9a7c-48c5-920f-cb91924fa680",
    "createdAt": "2026-06-05T09:15:30.456Z",
    "updatedAt": "2026-06-05T09:15:30.456Z",
    "deviceId": "7c9e6d11-5bb9-4a94-b152-32b4b455df10",
    "startTime": "2026-06-05T09:15:30.000Z",
    "endTime": "2026-06-05T09:15:30.000Z",
    "mediaType": "video_chunk",
    "s3Key": "media-logs/7c9e6d11-5bb9-4a94-b152-32b4b455df10/1717578000000-trip-video.mp4",
    "fileUrl": "",
    "snapshotId": "alert-snapshot-99",
    "lat": 10.764500,
    "lng": 106.662000
  }
]
```

### Cách hiển thị trên FE:
1.  **Vẽ Pins**: Lấy danh sách từ endpoint `GET /media-logs/map-pins`. Lặp qua từng phần tử, dùng cặp `lat`/`lng` để vẽ điểm đánh dấu lên bản đồ (Mapbox/Leaflet).
2.  **Xem chi tiết / Stream**: Khi người dùng nhấn vào một điểm pin:
    *   Lấy thuộc tính `id` của pin đó.
    *   Gọi API `GET /media-logs/:id/stream` để nhận URL presigned bảo mật tạm thời (tồn tại trong 1 giờ) nhằm hiển thị hình ảnh (`<img>`) hoặc phát video trực tiếp trong player (`<video>`).
