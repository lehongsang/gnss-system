# 📦 Storage & Media Services Guide

This guide explains how to use the standardized media management system in the project. The system handles file uploads, image optimization, and secure serving via S3-compatible storage (SeaweedFS).

---

## 🏗️ Architecture Overview

The system centers around the `StorageService`, which interacts with:
- **SeaweedFS**: For binary file storage.
- **PostgreSQL**: Via the `Media` entity for metadata tracking.
- **Sharp**: For automatic image resizing and WebP conversion.
- **Kafka**: For offloading heavy uploads to background tasks (Asynchronous flow).

---

## 📟 Usage Guide

To implement file uploads in your module, follow these three steps:

### 1️⃣ Decorate the Controller
Use our custom decorators to handle Multer configuration and Swagger (OpenAPI) documentation automatically.

```typescript
import { ApiFile, ApiFiles } from '@/commons/decorators/file-upload.decorator';

@Controller('products')
export class ProductsController {
  
  // Single file upload
  @Post(':id/image')
  @ApiFile('image', 1) 
  async uploadImage(@UploadedFile() file: Express.Multer.File) { 
    return this.service.handleUpload(file);
  }

  // Multiple files (max 5)
  @Post(':id/gallery')
  @ApiFiles('images', 5)
  async uploadGallery(@UploadedFiles() files: Express.Multer.File[]) {
    return this.service.handleGallery(files);
  }
}
```

### 2️⃣ Validate the File
Always use the `FileFieldsValidationPipe` to ensure files meet size and type requirements.

```typescript
import { FileFieldsValidationPipe } from '@/commons/pipes/file-validation.pipe';
import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES } from '@/commons/constants/app.constants';

@Post('avatar')
@ApiFile('avatar')
async uploadAvatar(
  @UploadedFile(
    new FileFieldsValidationPipe({
      maxSize: MAX_FILE_SIZE,    // e.g., 5MB
      fileType: ALLOWED_IMAGE_TYPES, // e.g., ['image/jpeg', 'image/png']
      required: true,
    }),
  )
  file: Express.Multer.File,
) {
  return this.storageService.uploadFile(file);
}
```

### 3️⃣ Process in Service
The `uploadFile` method handles both storage and database persistence.

```typescript
// Synchronous (Default): Best for small files like avatars
const media = await this.storageService.uploadFile(file, true, StoragePath.AVATARS);

// Asynchronous: Recommended for high-traffic or large batch uploads
// Saves PENDING record to DB and offloads S3 upload to Kafka
const mediaPending = await this.storageService.uploadFile(file, false, StoragePath.UPLOADS);
```

---

## 🔗 Serving Media (Presigned URLs)

We **do not store public URLs** in the database because storage endpoints may change. Instead, we store the `s3Key`. Before returning a media record to the client, you must generate a temporary **Presigned URL**.

### 🛠️ In your Service/Controller:
```typescript
async getProfile(userId: string) {
  const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['avatar'] });
  
  if (user?.avatar) {
    // Generate a secure link valid for 1 hour
    user.avatar.url = await this.storageService.getPresignedUrl(user.avatar.s3Key);
  }
  return user;
}
```

---

## 📟 Core Service Methods

The `StorageService` provides three primary methods for managing media across the application.

### 📤 `uploadFile(file, isSync?, folder?)`
The main entry point for all file uploads. It handles image processing, database persistence, and storage coordination.

- **Parameters**:
  - `file`: A Multer file object (must contain `buffer`, `originalname`, `mimetype`, `size`).
  - `isSync` (Optional):
    - `true` (Default): App waits for the S3 upload to complete before returning. Use for critical small files (avatars).
    - `false`: App returns quickly, offloading the S3 upload to a **Kafka background worker**. The record status will be `PENDING`.
  - `folder` (Optional): The destination directory in the bucket. We recommend using the `StoragePath` enum (e.g., `StoragePath.USERS_AVATAR`).
- **Processing Logic**:
  - Validates that the file is an image.
  - Uses **Sharp** to resize to max 2000px and convert to **WebP** (80% quality).
  - Returns the saved `Media` entity.

### 🔗 `getPresignedUrl(key, expiresInSeconds?)`
Since we use private buckets, the files are not accessible via direct HTTP. This method generates a temporary, signed link that a browser can use to display the image.

- **Parameters**:
  - `key`: The `s3Key` stored in the `Media` entity.
  - `expiresInSeconds` (Optional): Link duration. Defaults to `3600` (1 hour).
- **Pro Tip**: Use this inside your controllers/services right before returning the data to the client. Do not store these URLs in the database as they expire!

### 🗑️ `deleteFile(mediaId)`
Performs a dual cleanup by removing both the physical file from S3 and its metadata from the database.

- **Logic**:
  1. Locates the `Media` record by ID.
  2. If an `s3Key` exists, it triggers a `DeleteObjectCommand` to SeaweedFS.
  3. If no other table references this media (foreign key check), the database record is removed.
  4. If a reference exists (e.g., a product still points to this image), it logs a warning and keeps the metadata but the file in S3 **is still deleted**.

---

## 🔄 Automated Tasks (Kafka Consumer)

The `StorageService` also implements `OnModuleInit` to listen for Kafka messages from two topics:

| Topic | Trigger | Action |
|:---|:---|:---|
| `storage.upload` | `isSync = false` upload | Reads Base64 buffer, uploads to S3, updates `Media` status to `COMPLETED`. |
| `gnss.media.upload` | MQTT camera data via `MqttService` | Decodes Base64 frame (image/video), uploads to `gnss/images` or `gnss/videos` folder in S3. |

If a message is received from `gnss.media.upload`:
1. It decodes the Base64 payload sent by the MQTT bridge.
2. It uploads the file to the S3 bucket under `StoragePath.GNSS_IMAGES` or `StoragePath.GNSS_VIDEOS`.
3. It saves the `Media` metadata record to the database with the device ID tagged.

> [!NOTE]
> Hình ảnh / video từ camera GNSS **không** đi qua API upload thông thường. Chúng được ingested hoàn toàn qua kênh MQTT → Kafka → StorageService.

---

## 🛠️ Maintenance & Best Practices

### Deleting Files
Use `deleteFile(mediaId)` to clean up both storage and metadata:
```typescript
await this.storageService.deleteFile(media.id);
```
> [!NOTE]
> If a file is still referenced by other tables (Foreign Key), `deleteFile` will remove the file from S3 but keep the database record with a warning to prevent DB constraint errors.

### Folder Structure (StoragePath enum)
Always use the `StoragePath` enum to organize files:
- `users/avatars` — avatar người dùng
- `gnss/images` — ảnh chụp từ camera thiết bị GNSS (ingested qua MQTT → Kafka)
- `gnss/videos` — video từ camera thiết bị GNSS (ingested qua MQTT → Kafka)
- `uploads` (Default)

---

## 🔗 Related docs

- [MQTT.md](./MQTT.md) — MQTT Gateway & luồng dữ liệu từ thiết bị
- [KAFKA.md](./KAFKA.md) — Kafka topics & messaging
