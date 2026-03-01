# Custom Exceptions

A collection of custom exception classes for handling errors consistently and async logging without blocking requests.

## Features

✅ **Custom Exception Classes**: BadRequest, Unauthorized, Forbidden, NotFound, Conflict, InternalError
✅ **Async Logging**: Fire-and-Forget pattern (non-blocking)
✅ **Error Codes**: Enum ErrorCode to identify error types
✅ **Standardized Response**: All errors return the same format

## Usage

### 1. Import exceptions

```typescript
import { BadRequest, NotFound, Unauthorized } from '@/commons/exceptions';
import { ErrorCode } from '@/commons/exceptions';
```

### 2. Throw exceptions

```typescript
// Bad Request (400)
throw new BadRequest('Invalid email format', ErrorCode.INVALID_INPUT);

// Unauthorized (401)
throw new Unauthorized('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);

// Forbidden (403)
throw new Forbidden('You don't have permission', ErrorCode.INSUFFICIENT_PERMISSIONS);

// Not Found (404)
throw new NotFound('User not found', ErrorCode.USER_NOT_FOUND);

// Conflict (409)
throw new Conflict('Email already exists', ErrorCode.DUPLICATE_ENTRY);

// Internal Error (500)
throw new InternalError('Database connection failed', ErrorCode.DATABASE_ERROR);
```

### 3. Register CustomExceptionFilter in main.ts

```typescript
app.useGlobalFilters(
  new BetterAuthErrorExceptionFilter(loggerService),
  new HttpExceptionFilter(loggerService),
  new CustomExceptionFilter(loggerService), // Add this
);
```

## Response Format

```json
{
  "statusCode": 404,
  "message": "User not found",
  "code": "USER_NOT_FOUND"
}
```

## Error Codes

| Code                    | HTTP | Description            |
| ----------------------- | ---- | ---------------------- |
| INVALID_INPUT           | 400  | Validation error       |
| UNAUTHORIZED            | 401  | Authentication failed  |
| FORBIDDEN               | 403  | Authorization failed   |
| RESOURCE_NOT_FOUND      | 404  | Resource doesn't exist |
| RESOURCE_ALREADY_EXISTS | 409  | Duplicate resource     |
| INTERNAL_SERVER_ERROR   | 500  | Server error           |

## Async Logging

Logging is performed asynchronously using `setImmediate()`:

- Does not block request response
- Logs are written to JSON file
- If logging fails, errors are caught silently

```typescript
// Fire-and-Forget logging
setImmediate(() => {
  this.logger.error(exception.message, exception.stack || '', context);
});
```

## Custom Error Codes

You can extend the ErrorCode enum:

```typescript
// error-codes.ts
export enum ErrorCode {
  // ... existing codes
  CUSTOM_ERROR = 'CUSTOM_ERROR',
}
```

Then throw with custom code:

```typescript
throw new BadRequest('Custom error', ErrorCode.CUSTOM_ERROR);
```
