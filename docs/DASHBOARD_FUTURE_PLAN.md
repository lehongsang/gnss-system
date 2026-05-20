# Dashboard Future Enhancement Plan

## 1. Muc tieu

Tai lieu nay ghi lai cac hang muc dashboard hien tai chua can lam ngay, nhung nen du tru de sau nay co the mo rong ma khong phai thiet ke lai tu dau.

Pham vi tam hoan:

- Hien thi HDOP / VDOP tu thiet bi GNSS.
- Hien thi so ve tinh dang su dung / tong so ve tinh thay duoc.
- Tinh dung luong storage da dung tu media that.
- Dong bo du lieu media tu MQTT vao man hinh Storage/Dashboard.
- Bo sung ten thiet bi va cac chi so chat luong tin hieu vao panel trang thai thiet bi.

## 2. Hien trang hien tai

Dashboard hien tai da co API:

```text
GET /api/dashboard/stats
```

API nay dang tra cac thong tin:

```text
totalDevices
onlineDevices
offlineDevices
alerts24h
criticalAlerts
warningAlerts
infoAlerts
telemetryPoints
telemetryRate
mediaUsedBytes
mediaTotalBytes
```

Trong do:

- `totalDevices`, `onlineDevices`, `offlineDevices`: da lay tu database.
- `alerts24h`, `criticalAlerts`, `warningAlerts`, `infoAlerts`: da lay tu database.
- `telemetryPoints`, `telemetryRate`: da lay tu database.
- `mediaTotalBytes`: lay tu env `DASHBOARD_MEDIA_TOTAL_BYTES`, mac dinh 5 GB.
- `mediaUsedBytes`: hien dang fix cung `0`, chua tinh tu storage/media.

## 3. Cac du lieu dang thieu hoac dang mock

| Khu vuc UI | Trang thai hien tai | Ghi chu |
| :--- | :--- | :--- |
| HDOP / VDOP | Chua co field backend | Dang co kha nang mock o frontend |
| Satellites `12/24` | Chua co field backend | Can them vao telemetry hoac device status |
| Storage used | Dang fix `0` | Chua tinh tu `medias` va `media_logs` |
| Device name trong status panel | Status API chua tra `device.name` | Frontend phai merge voi API devices hoac backend join san |
| Media MQTT trong Storage | Tach bang `media_logs` va `medias` | Can API tong hop neu muon hien chung |

## 4. De xuat mo rong payload MQTT

Co 2 cach dua HDOP / VDOP va satellites vao he thong.

### Phuong an A: Dua vao topic coordinates

Topic:

```text
gnss/<deviceId>/coordinates
```

Payload de xuat:

```json
{
  "lng": 106.6958,
  "lat": 10.7769,
  "speed": 45.5,
  "heading": 270,
  "hdop": 1.5,
  "vdop": 2.0,
  "satellitesUsed": 12,
  "satellitesTotal": 24,
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

Phu hop khi cac chi so nay gan voi moi diem telemetry.

### Phuong an B: Dua vao topic status

Topic:

```text
gnss/<deviceId>/status
```

Payload de xuat:

```json
{
  "status": "online",
  "batteryLevel": 72,
  "cameraStatus": true,
  "gnssStatus": true,
  "hdop": 1.5,
  "vdop": 2.0,
  "satellitesUsed": 12,
  "satellitesTotal": 24
}
```

Phu hop khi dashboard chi can trang thai gan nhat cua thiet bi.

Khuyen nghi: dung **phuong an A** neu can lich su chat luong tin hieu theo thoi gian; dung **phuong an B** neu chi can hien thi trang thai hien tai.

## 5. De xuat thay doi database

Neu luu vao `telemetry`, bo sung cac cot:

```text
hdop             float nullable
vdop             float nullable
satellites_used  integer nullable
satellites_total integer nullable
```

Neu luu vao `device_status`, bo sung cac cot:

```text
hdop             float nullable
vdop             float nullable
satellites_used  integer nullable
satellites_total integer nullable
```

Neu can tinh storage usage chinh xac cho media thiet bi, bo sung vao `media_logs`:

```text
size bigint nullable
mime_type varchar nullable
```

Ly do: hien `media_logs` co `s3_key`, nhung chua luu kich thuoc file nen dashboard khong tinh duoc dung luong video/anh tu thiet bi.

## 6. De xuat API sau nay

### 6.1. Dashboard stats

Mo rong:

```text
GET /api/dashboard/stats
```

Them cac field:

```json
{
  "mediaUsedBytes": 123456789,
  "mediaTotalBytes": 5368709120
}
```

`mediaUsedBytes` nen tinh tu:

```text
SUM(medias.size) + SUM(media_logs.size)
```

Neu chua them `media_logs.size`, tam thoi chi tinh duoc bang `medias`.

### 6.2. Device status list

Mo rong:

```text
GET /api/devices/status/mine
GET /api/devices/status/all
```

Response de xuat:

```json
{
  "deviceId": "019...",
  "deviceName": "Device A - Tracker",
  "status": "online",
  "batteryLevel": 72,
  "cameraStatus": true,
  "gnssStatus": true,
  "hdop": 1.5,
  "vdop": 2.0,
  "satellitesUsed": 12,
  "satellitesTotal": 24,
  "updatedAt": "2026-05-20T10:00:00.000Z"
}
```

### 6.3. Unified storage files

Neu muon man Storage hien ca file user upload va media tu thiet bi, co the mo rong:

```text
GET /api/storage/files
```

Response can co `source` de phan biet:

```json
{
  "id": "019...",
  "source": "storage_file",
  "name": "Report.pdf",
  "type": "document",
  "size": 1200000,
  "createdAt": "2026-05-20T10:00:00.000Z"
}
```

```json
{
  "id": "019...",
  "source": "device_media",
  "name": "Device video chunk",
  "type": "video",
  "size": 850000000,
  "createdAt": "2026-05-20T10:00:00.000Z"
}
```

## 7. De xuat thu tu thuc hien sau nay

1. Them field `size` va `mimeType` vao `media_logs`.
2. Cap nhat `MediaLogsConsumer` de luu kich thuoc file sau khi decode Base64.
3. Cap nhat `DashboardService.getStats()` de tinh `mediaUsedBytes`.
4. Chon noi luu HDOP / VDOP / satellites: `telemetry` hoac `device_status`.
5. Cap nhat MQTT interface va consumer tuong ung.
6. Cap nhat API status de tra `deviceName`, `hdop`, `vdop`, `satellitesUsed`, `satellitesTotal`.
7. Cap nhat frontend dashboard de bo mock data.
8. Neu can, mo rong `/api/storage/files` de merge ca `medias` va `media_logs`.

## 8. Tieu chi hoan thanh

Dashboard duoc coi la het mock khi:

- Card storage hien dung dung luong da su dung.
- Panel trang thai thiet bi lay `deviceName`, battery, online/offline tu API.
- HDOP / VDOP lay tu backend, khong fix cung.
- Satellites lay tu backend, khong fix cung.
- Map marker lay tu latest telemetry cua tung thiet bi.
- Video/anh tu MQTT co the xuat hien trong man hinh Storage neu san pham yeu cau quan ly tap trung.

