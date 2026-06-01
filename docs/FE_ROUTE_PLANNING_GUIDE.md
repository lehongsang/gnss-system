# FE Route Planning Guide

Tai lieu nay mo ta cach FE tich hop chuc nang tim duong, gan tuyen cho thiet bi va giam sat lech tuyen.

Backend da co module:

```txt
src/modules/route-plans
```

Base API:

```txt
/api/route-plans
```

## 1. Muc tieu FE

FE can lam cac luong chinh:

1. Chon thiet bi tren ban do.
2. Lay vi tri moi nhat cua thiet bi lam diem bat dau.
3. User click tren map de chon diem den.
4. Goi API preview route.
5. Ve route polyline tren ban do.
6. User luu route plan.
7. User activate route de backend bat dau giam sat lech tuyen.
8. FE cap nhat marker thiet bi realtime qua WebSocket.
9. FE hien alert khi backend phat hien `trajectory_deviation`.

Ngoai cach click tren map, FE co the cho user go ten dia diem, vi du:

```txt
Dai hoc Bach khoa Ha Noi
```

Sau do dung Mapbox Geocoding de doi text thanh toa do, roi dung toa do do lam `destination`.

## 2. API Summary

| Chuc nang | Method | Endpoint |
| :--- | :--- | :--- |
| Preview route | POST | `/api/route-plans/preview` |
| Tao route plan | POST | `/api/route-plans` |
| Danh sach route cua user | GET | `/api/route-plans/mine` |
| Danh sach tat ca route | GET | `/api/route-plans` |
| Chi tiet route | GET | `/api/route-plans/:id` |
| Activate route | POST | `/api/route-plans/:id/activate` |
| Complete route | POST | `/api/route-plans/:id/complete` |
| Cancel route | POST | `/api/route-plans/:id/cancel` |
| Delete route | DELETE | `/api/route-plans/:id` |

Tat ca endpoint can auth session/JWT giong cac API khac cua he thong.

## 3. Lay vi tri bat dau

Khi user chon mot thiet bi, FE lay telemetry moi nhat:

```txt
GET /api/telemetry/:deviceId/latest
```

Dung response telemetry lam origin:

```ts
const origin = {
  lat: latestTelemetry.lat,
  lng: latestTelemetry.lng,
};
```

Neu thiet bi chua co telemetry, FE nen disable chuc nang tao route va hien thong bao:

```txt
Thiet bi chua co vi tri moi nhat de tao tuyen.
```

## 4. Preview Route

Endpoint:

```txt
POST /api/route-plans/preview
```

Request body:

```json
{
  "origin": {
    "lat": 10.7769,
    "lng": 106.6958
  },
  "destination": {
    "lat": 10.8012,
    "lng": 106.7148
  },
  "mode": "driving"
}
```

`mode` hop le:

```txt
driving
walking
cycling
```

Response:

```json
{
  "distanceMeters": 4416,
  "durationSeconds": 900,
  "encodedPolyline": null,
  "geojson": {
    "type": "LineString",
    "coordinates": [
      [106.6958, 10.7769],
      [106.7001, 10.7802],
      [106.7148, 10.8012]
    ]
  },
  "provider": "mapbox",
  "profile": "mapbox/driving",
  "steps": [
    {
      "name": "Nguyen Van Cu",
      "distanceMeters": 500,
      "durationSeconds": 80,
      "instruction": "Head north"
    }
  ]
}
```

Luu y quan trong:

```txt
GeoJSON coordinates co thu tu [lng, lat].
```

Neu FE dung Mapbox GL JS/MapLibre va ve bang GeoJSON source thi co the dung truc tiep.

Neu FE dung Leaflet polyline thi phai convert sang `[lat, lng]`.

## 4.1. Chon diem den bang search text

Backend route planning hien tai nhan destination dang toa do:

```ts
destination: { lat: number; lng: number }
```

Vi vay neu user go ten dia diem, FE can them buoc:

```txt
search text -> Mapbox Search Box suggest -> user chon suggestion -> retrieve -> lay toa do -> preview route
```

Khong nen dung Mapbox Geocoding v6 cho o search POI nhu:

```txt
benh vien bach mai
dai hoc bach khoa ha noi
vincom ba trieu
```

Mapbox Geocoding v6 khong con tra POI data; Mapbox khuyen dung Search Box API cho interactive search/autocomplete. Search Box API phu hop hon vi no ho tro POI, address, street, neighborhood, place name, district, postcode, region, country.

### Goi Mapbox Search Box tu FE

Vi FE da co Mapbox public token de render map, co the dung token do cho Search Box.

Luong dung:

```txt
1. User go text
2. FE goi /suggest
3. FE hien dropdown suggestions
4. User chon suggestion
5. FE goi /retrieve bang mapbox_id
6. Lay toa do tu feature geometry
7. Goi /api/route-plans/preview
```

### Suggest endpoint

Endpoint:

```txt
GET https://api.mapbox.com/search/searchbox/v1/suggest
```

Query params de xuat:

```txt
q=<search text>
country=VN
language=vi
limit=5
proximity=<lng>,<lat>
types=poi,address,street,place
session_token=<uuid-v4>
access_token=<MAPBOX_TOKEN>
```

Vi du:

```txt
https://api.mapbox.com/search/searchbox/v1/suggest?q=b%E1%BB%87nh%20vi%E1%BB%87n%20b%E1%BA%A1ch%20mai&country=VN&language=vi&limit=5&proximity=105.841,21.003&types=poi,address,street,place&session_token=SESSION_UUID&access_token=YOUR_MAPBOX_TOKEN
```

Luu y:

- `proximity` nen la vi tri hien tai cua ban do hoac vi tri thiet bi, theo thu tu `lng,lat`.
- `country=VN` giup uu tien ket qua o Viet Nam.
- `language=vi` giup ten hien thi phu hop hon.
- `types=poi,address,street,place` giup tim ca dia diem/benh vien/truong hoc, khong chi tim duong.
- `session_token` nen tao moi cho moi phien search cua user, dung UUID v4.
- Nen debounce input khoang 300-500ms de tranh goi API qua nhieu.
- Chi goi khi search text co it nhat 2-3 ky tu.

### Parse ket qua suggest

Search Box suggest response co danh sach `suggestions`.

FE lay tung item:

```ts
type PlaceSuggestion = {
  id: string;
  mapboxId: string;
  name: string;
  fullAddress: string;
};
```

Mapping y tuong:

```ts
const suggestions = response.suggestions.map((item) => {
  return {
    id: item.mapbox_id,
    mapboxId: item.mapbox_id,
    name: item.name,
    fullAddress: item.full_address ?? item.place_formatted ?? '',
  };
});
```

### Retrieve endpoint

Khi user chon mot suggestion, FE goi retrieve de lay toa do chinh xac.

Endpoint:

```txt
GET https://api.mapbox.com/search/searchbox/v1/retrieve/{mapbox_id}
```

Query params:

```txt
session_token=<same-session-token>
access_token=<MAPBOX_TOKEN>
```

Parse toa do:

```ts
const feature = response.features?.[0];
const [lng, lat] = feature.geometry.coordinates;

const destination = { lat, lng };
setDestination(destination);
setDestinationLabel(
  feature.properties?.full_address ??
  feature.properties?.name ??
  suggestion.name,
);
```

Sau do FE goi preview route:

```ts
await api.post('/api/route-plans/preview', {
  origin,
  destination,
  mode,
});
```

### UI search box de xuat

Trong panel tao route:

```txt
[Device selector]
[Search destination input: "Nhap dia diem den"]
[Suggestion dropdown]
[Mode selector]
[Threshold input]
[Preview route button]
[Save route button]
```

Suggestion item nen hien:

```txt
Ten dia diem
Dia chi day du
```

Vi du voi query:

```txt
benh vien bach mai
```

Ket qua mong muon nen la POI benh vien, khong phai chi la duong/phuong `Bach Mai`.

Neu van khong ra POI dung, thu query co dau va day du hon:

```txt
Bệnh viện Bạch Mai, Hà Nội
Bach Mai Hospital, Hanoi
78 Giải Phóng, Đống Đa, Hà Nội
```

Khi hover/click suggestion:

- Dat destination marker len map.
- Fly map den destination.
- Goi preview route hoac cho user bam `Xem truoc tuyen`.

### Click map va search text nen dung chung state

Du user click map hay search text, FE nen quy ve cung mot state:

```ts
destination = { lat, lng }
destinationLabel = 'Dai hoc Bach khoa Ha Noi'
```

Khac nhau:

- Click map: co toa do ngay, label co the de trong hoac reverse geocode sau.
- Search text: co label va toa do tu Mapbox Geocoding.

### Co nen tao backend endpoint search khong?

MVP: FE co the goi Mapbox Search Box truc tiep bang public token.

Neu muon quan ly quota/log/cache tot hon, co the them backend endpoint sau:

```txt
GET /api/route-plans/search?q=Dai%20hoc%20Bach%20khoa%20Ha%20Noi&proximityLng=105.8&proximityLat=21.0
```

Backend se proxy sang Mapbox Search Box. Cach nay giup:

- Khong lap logic Mapbox o nhieu FE client.
- Co the cache query pho bien.
- Co the log search usage.
- Co the doi provider sau nay ma FE khong doi API.

## 5. Ve route tren Mapbox GL JS

Vi backend tra GeoJSON LineString, FE co the tao source/layer:

```ts
const routeGeoJson = {
  type: 'Feature',
  geometry: previewRoute.geojson,
  properties: {},
};

if (map.getSource('route-preview')) {
  const source = map.getSource('route-preview') as mapboxgl.GeoJSONSource;
  source.setData(routeGeoJson as GeoJSON.Feature);
} else {
  map.addSource('route-preview', {
    type: 'geojson',
    data: routeGeoJson,
  });

  map.addLayer({
    id: 'route-preview-line',
    type: 'line',
    source: 'route-preview',
    paint: {
      'line-color': '#2563eb',
      'line-width': 5,
      'line-opacity': 0.85,
    },
  });
}
```

Fit bounds theo route:

```ts
const bounds = new mapboxgl.LngLatBounds();

previewRoute.geojson.coordinates.forEach(([lng, lat]) => {
  bounds.extend([lng, lat]);
});

map.fitBounds(bounds, {
  padding: 80,
  duration: 600,
});
```

## 6. Ve route tren Leaflet

Leaflet dung `[lat, lng]`, nen can convert:

```ts
const latLngs = previewRoute.geojson.coordinates.map(([lng, lat]) => [
  lat,
  lng,
]);

L.polyline(latLngs, {
  color: '#2563eb',
  weight: 5,
  opacity: 0.85,
}).addTo(map);
```

## 7. Tao Route Plan

Sau khi preview thanh cong, user bam "Luu tuyen".

Endpoint:

```txt
POST /api/route-plans
```

Request body:

```json
{
  "deviceId": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
  "name": "Tuyen den kho A",
  "origin": {
    "lat": 10.7769,
    "lng": 106.6958
  },
  "destination": {
    "lat": 10.8012,
    "lng": 106.7148
  },
  "mode": "driving",
  "deviationThresholdMeters": 50
}
```

Response la route plan da duoc luu:

```json
{
  "id": "route-plan-id",
  "deviceId": "019e4a45-b4aa-74ed-b5c2-484b89b18701",
  "ownerId": "user-id",
  "name": "Tuyen den kho A",
  "status": "planned",
  "provider": "mapbox",
  "profile": "mapbox/driving",
  "originLat": 10.7769,
  "originLng": 106.6958,
  "destinationLat": 10.8012,
  "destinationLng": 106.7148,
  "distanceMeters": 4416,
  "durationSeconds": 900,
  "deviationThresholdMeters": 50,
  "activatedAt": null,
  "completedAt": null,
  "geom": {
    "type": "LineString",
    "coordinates": [
      [106.6958, 10.7769],
      [106.7148, 10.8012]
    ]
  }
}
```

## 8. Activate Route

Sau khi route da tao, user bam "Bat dau giam sat".

Endpoint:

```txt
POST /api/route-plans/:id/activate
```

Body: khong can body.

Response:

```json
{
  "id": "route-plan-id",
  "status": "active",
  "activatedAt": "2026-05-28T08:00:00.000Z"
}
```

Khi route active, backend se tu dong check moi telemetry point moi cua device:

```txt
TelemetryConsumer -> RouteDeviationService -> ST_Distance -> Alert
```

FE khong can tu tinh lech tuyen. FE chi can hien thi route va lang nghe alert.

## 9. Complete / Cancel Route

Khi thiet bi den dich hoac user muon ket thuc:

```txt
POST /api/route-plans/:id/complete
```

Khi user muon huy:

```txt
POST /api/route-plans/:id/cancel
```

Trang thai:

```txt
planned   = da tao, chua giam sat
active    = dang giam sat
completed = da hoan thanh
cancelled = da huy
```

## 10. Route List

Lay route cua user hien tai:

```txt
GET /api/route-plans/mine
```

Query supported:

```txt
deviceId
status
from
to
page
limit
sortBy
sortOrder
search
```

Vi du:

```txt
GET /api/route-plans/mine?deviceId=019e4a45-b4aa-74ed-b5c2-484b89b18701&status=active&page=1&limit=10
```

Admin lay tat ca:

```txt
GET /api/route-plans
```

## 11. WebSocket realtime

FE tiep tuc dung namespace hien co:

```txt
/gnss
```

Subscribe device room:

```ts
socket.emit('subscribe:device', deviceId);
```

Telemetry update:

```ts
socket.on('telemetry:update', (data) => {
  updateDeviceMarker(data.deviceId, {
    lat: data.lat,
    lng: data.lng,
    speed: data.speed,
    heading: data.heading,
  });
});
```

Alert realtime:

```ts
socket.emit('join:user', currentUser.id);

socket.on('alert:new', (alert) => {
  if (alert.alertType === 'trajectory_deviation') {
    showToast({
      title: 'Thiet bi di lech tuyen',
      message: alert.message,
      type: 'error',
    });

    highlightDevice(alert.deviceId);
    highlightActiveRoute(alert.deviceId);
  }
});
```

## 12. UI de xuat

### Map screen

Thanh dieu khien:

- Device selector.
- Mode selector: `driving`, `walking`, `cycling`.
- Input ten tuyen.
- Input nguong lech tuyen, default `50m`.
- Button `Chon diem den`.
- Button `Xem truoc tuyen`.
- Button `Luu tuyen`.
- Button `Bat dau giam sat`.
- Button `Hoan thanh`.
- Button `Huy tuyen`.

Tren map:

- Marker thiet bi/current origin.
- Marker destination.
- Route preview polyline.
- Active route polyline.
- Device realtime marker.

### Route list panel

Hien thi:

- Ten route.
- Thiet bi.
- Status.
- Distance.
- ETA.
- Threshold.
- Created time.
- Activated time.

Filter:

- Theo device.
- Theo status.
- Theo khoang thoi gian.

## 13. FE state de xuat

```ts
type RoutePlanningState = {
  selectedDeviceId: string | null;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  mode: 'driving' | 'walking' | 'cycling';
  routeName: string;
  deviationThresholdMeters: number;
  previewRoute: RoutePreview | null;
  savedRoute: RoutePlan | null;
  activeRoute: RoutePlan | null;
  isPreviewLoading: boolean;
  isSaving: boolean;
  isActivating: boolean;
};
```

## 14. Loi can xu ly tren FE

### Chua co latest telemetry

Khong cho tao route:

```txt
Thiet bi chua co vi tri moi nhat.
```

### Mapbox khong tim duoc route

Backend co the tra 404:

```txt
Khong tim thay tuyen duong phu hop.
```

### Token/quota Mapbox loi

Backend co the tra 503:

```txt
Dich vu tim duong tam thoi khong kha dung.
```

### User khong co quyen voi device

Backend tra 403:

```txt
Ban khong co quyen tao tuyen cho thiet bi nay.
```

## 15. Luong demo hoan chinh

1. Mo dashboard map.
2. Chon device dang co telemetry.
3. Click mot diem den tren map.
4. Bam `Xem truoc tuyen`.
5. FE ve route polyline.
6. Nhap ten route va threshold.
7. Bam `Luu tuyen`.
8. Bam `Bat dau giam sat`.
9. Chay simulator gui telemetry gan route -> khong co alert.
10. Chay simulator gui telemetry cach route tren 50m -> backend tao alert `trajectory_deviation`.
11. FE hien toast va highlight device/route.

## 16. Luu y implement

- Backend tra GeoJSON LineString theo chuan `[lng, lat]`.
- FE khong can goi Mapbox Directions API truc tiep cho route planning.
- FE van dung Mapbox token rieng de render map nen.
- Khi user click map, Mapbox event thuong tra `{ lng, lat }`; body backend can `{ lat, lng }`.
- Khong goi preview lien tuc khi user di chuyen chuot. Chi goi khi click diem den hoac bam preview.
- Nen debounce neu co autocomplete/search destination.
- Nen clear route preview khi user doi device hoac doi destination.
