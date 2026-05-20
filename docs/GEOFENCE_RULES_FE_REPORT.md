# Geofence Rules FE Integration Report

## 1. Muc tieu thay doi

Backend da mo rong geofence tu mot kieu duy nhat thanh 2 kieu rule:

```text
allowed_zone
forbidden_zone
```

Y nghia:

| Type | Ten goi UI de xuat | Rule | Khi nao canh bao |
| :--- | :--- | :--- | :--- |
| `allowed_zone` | Vung duoc phep | Thiet bi phai nam ben trong vung | Khi thiet bi di ra ngoai vung |
| `forbidden_zone` | Vung cam | Thiet bi phai nam ben ngoai vung | Khi thiet bi di vao trong vung |

Behavior cu van duoc giu: geofence khong gui `type` se mac dinh la `allowed_zone`.

---

## 2. Field moi cua geofence

Them field:

```ts
type: 'allowed_zone' | 'forbidden_zone'
```

### Tao geofence

Endpoint:

```text
POST /api/geofences
```

Payload:

```json
{
  "name": "Khu vuc kho hang",
  "type": "allowed_zone",
  "color": "#3b82f6",
  "geom": {
    "type": "Polygon",
    "coordinates": [
      [
        [106.0, 10.0],
        [106.5, 10.0],
        [106.5, 10.5],
        [106.0, 10.0]
      ]
    ]
  }
}
```

Vung cam:

```json
{
  "name": "Khu vuc cam",
  "type": "forbidden_zone",
  "color": "#ef4444",
  "geom": {
    "type": "Polygon",
    "coordinates": [
      [
        [106.0, 10.0],
        [106.5, 10.0],
        [106.5, 10.5],
        [106.0, 10.0]
      ]
    ]
  }
}
```

### Cap nhat geofence

Endpoint:

```text
PATCH /api/geofences/:id
```

Payload co the gui rieng field `type`:

```json
{
  "type": "forbidden_zone"
}
```

---

## 3. Response geofence FE can bat

Response list/detail geofence se co them:

```json
{
  "id": "019...",
  "name": "Khu vuc cam",
  "type": "forbidden_zone",
  "color": "#ef4444",
  "geom": {
    "type": "Polygon",
    "coordinates": []
  },
  "paths": [
    { "lat": 10.0, "lng": 106.0 }
  ],
  "vertexCount": 3,
  "Devices": ["019..."]
}
```

FE nen:

- Hien badge theo `type`.
- Doi mau mac dinh theo `type`.
- Cho user chon type khi tao/sua vung.
- Hien tooltip/copy giai thich rule cua tung type.

Copy de xuat:

```text
allowed_zone: Thiet bi phai di chuyen ben trong vung nay.
forbidden_zone: Thiet bi khong duoc di chuyen vao trong vung nay.
```

---

## 4. Alert type moi

Backend them alert type:

```text
geofence_entry
```

Danh sach geofence alert hien co:

| Alert type | Khi nao sinh ra |
| :--- | :--- |
| `geofence_exit` | Thiet bi ra khoi `allowed_zone` |
| `geofence_entry` | Thiet bi di vao `forbidden_zone` |

FE can cap nhat cac man:

- Dashboard alert count/group.
- Alert list filter.
- Alert detail.
- Notification icon/color.
- Translation label.

Label de xuat:

```text
geofence_exit  -> Roi khoi vung duoc phep
geofence_entry -> Di vao vung cam
```

Severity hien tai khong co field rieng trong DB alert. Dashboard backend dang tinh `geofence_entry` vao nhom critical.

---

## 5. Logic canh bao moi

Backend co bang trang thai moi:

```text
geofence_device_states
```

Bang nay luu trang thai gan nhat cua tung cap:

```text
device_id
geofence_id
state: inside | outside
updated_at
```

Muc dich:

- Khong spam alert moi lan telemetry gui len.
- Chi canh bao khi co transition hoac lan dau da o trang thai vi pham.

Rule:

```text
allowed_zone:
  inside -> outside = geofence_exit

forbidden_zone:
  outside -> inside = geofence_entry
```

Neu thiet bi tiep tuc nam trong trang thai vi pham, backend khong tao alert lap lai cho den khi state doi lai roi vi pham lan nua.

Redis cooldown 300 giay van duoc giu de chan spam trong truong hop telemetry dao dong quanh bien vung.

---

## 6. De xuat UI/UX

### Form tao/sua geofence

Them segmented control hoac select:

```text
Loai vung
[ Vung duoc phep ] [ Vung cam ]
```

Mapping:

```text
Vung duoc phep -> allowed_zone
Vung cam       -> forbidden_zone
```

Mau mac dinh de xuat:

```text
allowed_zone   -> #3b82f6 hoac xanh duong
forbidden_zone -> #ef4444 hoac do
```

### Map display

Nen phan biet visual:

```text
allowed_zone:
  stroke xanh duong
  fill xanh duong opacity thap

forbidden_zone:
  stroke do
  fill do opacity thap
```

### Alert display

Icon/copy de xuat:

```text
geofence_exit:
  icon: log-out / map-pin-off
  color: amber/orange
  text: Thiet bi roi khoi vung duoc phep

geofence_entry:
  icon: shield-alert / ban
  color: red
  text: Thiet bi di vao vung cam
```

---

## 7. Checklist FE can sua

| Hang muc | Viec can lam |
| :--- | :--- |
| Geofence create form | Them field `type` |
| Geofence edit form | Cho sua `type` |
| Geofence list/table | Hien badge `allowed_zone` / `forbidden_zone` |
| Map polygon | Doi style theo `type` |
| Alert enum | Them `geofence_entry` |
| Alert filter | Them option `geofence_entry` |
| Alert label | Dich label moi |
| Dashboard | Dam bao `geofence_entry` hien dung nhom critical |

