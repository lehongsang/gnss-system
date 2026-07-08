import type { Request, Response, NextFunction } from 'express';
import { generateId } from '../../utils/nanoid-generators';

/**
 * Middleware sinh và gắn correlationId duy nhất cho mỗi request.
 * Nếu upstream đã có header X-Correlation-ID thì tái sử dụng luôn (thân thiện với kiến trúc microservice).
 * ID này dùng để trace log xuyên suốt vòng đời của request.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Tái sử dụng correlation ID từ upstream nếu có, không thì sinh mới
  const correlationId =
    (req.headers['x-correlation-id'] as string) || generateId();

  // Gắn vào request (đã khai báo type qua express.d.ts nên không cần ép kiểu `any`)
  req.correlationId = correlationId;

  // Thêm vào response header để client cũng trace được
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

/**
 * Hàm hỗ trợ lấy correlation ID từ request (type-safe)
 */
export function getCorrelationId(req: Request): string {
  return req.correlationId || 'unknown';
}
