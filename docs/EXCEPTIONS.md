# ⚠️ Exception Handling

This project implements a robust error handling system using NestJS global filters and custom exception classes. It ensures consistent error responses across the entire application.

---

## 🏗️ Architecture

Errors are handled by several specialized filters registered in `main.ts`:

1.  **`BetterAuthErrorExceptionFilter`**: Specifically captures and reformats errors from the Better Auth engine.
2.  **`CustomExceptionFilter`**: Handles `BusinessException` and `CustomException` types.
3.  **`HttpExceptionFilter`**: Catches standard NestJS HTTP exceptions.
4.  **`AllExceptionsFilter`**: A final catch-all for any unhandled internal server errors.

---

## 🧪 Custom Exceptions

Use these classes to throw errors with specific HTTP status codes and application-level error codes:

| Exception | HTTP Status | Use Case |
| :--- | :--- | :--- |
| `BadRequest` | 400 | Validation errors, invalid input. |
| `Unauthorized` | 401 | Authentication failures. |
| `Forbidden` | 403 | Insufficient permissions. |
| `NotFound` | 404 | Resource does not exist. |
| `Conflict` | 409 | Resource already exists (e.g., duplicate email). |
| `InternalError` | 500 | Unexpected server errors. |

### 📟 Example Usage

```typescript
import { NotFound, ErrorCode } from '@/commons/exceptions';

// Throwing a standardized error
throw new NotFound('User not found', ErrorCode.USER_NOT_FOUND);
```

---

## 📋 Standard Error Response

All exceptions return a consistent JSON structure:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "code": "USER_NOT_FOUND",
  "timestamp": "2024-03-20T10:00:00.000Z",
  "path": "/api/users/123"
}
```

---

## 🛑 Error Codes

Defined in `src/commons/exceptions/error-codes.ts`. Common codes include:

- `INVALID_INPUT` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `RESOURCE_NOT_FOUND` (404)
- `RESOURCE_ALREADY_EXISTS` (409)
- `INTERNAL_SERVER_ERROR` (500)

---

## 🪵 Async Logging

Exceptions are logged **asynchronously** using a "fire-and-forget" pattern (`setImmediate`). This ensures that logging operations (which might include IO) do not block the response back to the client.
