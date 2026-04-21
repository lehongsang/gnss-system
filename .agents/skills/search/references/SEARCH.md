# 🔍 OpenSearch Service

This project integrates **OpenSearch** for full-text search, document indexing, and advanced analytics.

---

## 🏗️ Architecture

The `SearchService` is a wrapper around the `@opensearch-project/opensearch` client, provided globally via the `SearchModule`.

- **Engine**: [OpenSearch](https://opensearch.org/)
- **Integration**: `src/services/search/search.service.ts`
- **Port**: Default `9200`
- **Dashboard**: Default `5601`

---

## ✨ Features

- **Document Indexing**: Support for single document indexing and bulk operations.
- **Full-Text Search**: Flexible search method that accepts standard OpenSearch query DSL.
- **Index Management**: Methods to create, delete, and check existence of indices.
- **Connection Health**: Automatic connection health check on module initialization.

---

## 🛠️ Configuration

Key environment variables in `.env`:

```env
OPENSEARCH_HOST=localhost
OPENSEARCH_PORT=9200
OPENSEARCH_PROTOCOL=http
OPENSEARCH_ADMIN_USER=admin
OPENSEARCH_ADMIN_PASSWORD=complex_Password_123!
```

---

## 📟 Example Usage

### 🚀 Indexing a Document

```typescript
import { SearchService } from '@/services/search/search.service';

@Injectable()
export class MyService {
  constructor(private readonly searchService: SearchService) {}

  async indexDevice(device: Device) {
    await this.searchService.indexDocument('devices', device.id, {
      name: device.name,
      macAddress: device.macAddress,
      ownerId: device.ownerId,
      createdAt: device.createdAt,
    });
  }
}
```

### 🔍 Searching Documents

```typescript
async findDevices(keyword: string) {
  const query = {
    query: {
      multi_match: {
        query: keyword,
        fields: ['name^2', 'macAddress']
      }
    }
  };
  return await this.searchService.search('devices', query);
}
```

---

## 📋 Recommended Practices

1. **Mappings**: Always define explicit mappings for your indices using `createIndex(index, settings)` before indexing data to ensure correct data types (e.g., `keyword` vs `text`).
2. **Bulk Operations**: Use the `bulk` method when processing many documents simultaneously to improve performance.
3. **Error Handling**: The service logs errors automatically, but ensure you handle them at the application layer if fallback logic is needed.
