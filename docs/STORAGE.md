# 📦 Storage Services

This project handles file storage (primarily media/images) using an S3-compatible interface, integrated with **SeaweedFS** or **Minio**.

---

## 🏗️ Architecture

The `StorageService` is located in `src/services/storage`. It uses the `@aws-sdk/client-s3` client to interact with storage backends.

- **Storage Engine**: [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (via S3 Gateway)
- **Database**: TypeORM `Media` entity for tracking file metadata.
- **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/) for optimization.
- **Messaging**: Kafka for asynchronous upload tasks.

---

## ✨ Features

- **Multi-Flow Upload**:
    - **Synchronous**: Directly upload to S3 and wait for completion. (Best for avatars/small files)
    - **Asynchronous**: Register intent in DB and offload the upload to a Kafka consumer. (Best for large/batch uploads)
- **Image Optimization**:
    - Resize to a maximum of 2000px (width or height).
    - Automatic conversion to **WebP** (80% quality).
- **Metadata Management**:
    - DB record tracks: `filename`, `originalName`, `mimeType`, `size`, `s3Key`, `url`, and `status`.
    - Status codes: `PENDING`, `COMPLETED`, `FAILED`.

---

## 🛠️ Configuration

Key environment variables in `.env`:

```env
S3_ENDPOINT=http://localhost:8888
S3_REGION=us-east-1
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=medias
S3_PUBLIC_URL=http://localhost:8888/buckets/medias
S3_FORCE_PATH_STYLE=true
```

---

## 📟 Example Usage

### 🚀 Uploading a File (Synchronous)

```typescript
import { StorageService } from '@/services/storage/storage.service';

@Injectable()
export class MyService {
  constructor(private readonly storageService: StorageService) {}

  async processAvatar(file: Express.Multer.File) {
    // Synchronous (awaits S3 response)
    const media = await this.storageService.uploadFile(file, true);
    console.log(`Uploaded to: ${media.url}`);
  }
}
```

### 🚀 Uploading a File (Asynchronous via Kafka)

```typescript
// Asynchronous (offloads to Kafka)
const mediaIntent = await this.storageService.uploadFile(file, false);
console.log(`Record created with ID: ${mediaIntent.id}. Processing in background...`);
```

---

## 🛠️ Kafka Topic

- **Topic**: `storage-upload`
- **Group ID**: `storage-group`
- **Message Format**:
    ```json
    {
      "mediaId": "uuidv7-of-media-record",
      "fileBuffer": "base64-encoded-content",
      "mimeType": "image/webp",
      "filename": "optimized-file-name.webp"
    }
    ```

---

## 📜 Maintenance

- Files are organized in the S3 bucket under the `uploads/` prefix.
- Deleting a file (`storageService.deleteFile`) removes both the S3 object and its database metadata record.
