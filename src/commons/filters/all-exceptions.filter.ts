import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { getCorrelationId } from '../middlewares/correlation-id.middleware';

/**
 * Filter bắt lỗi toàn cục (catch-all).
 * Bắt mọi exception KHÔNG được xử lý bởi các filter cụ thể khác
 * (ví dụ: TypeError, ReferenceError, hoặc lỗi bất ngờ nào khác).
 *
 * PHẢI đăng ký ĐẦU TIÊN trong useGlobalFilters() để nó chạy CUỐI CÙNG (NestJS duyệt filter theo thứ tự ngược lại).
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new LoggerService(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const correlationId = getCorrelationId(request);

    const isError = exception instanceof Error;
    const message = isError ? exception.message : 'Unknown error';
    const stack = isError ? exception.stack : '';

    // Luôn ghi log ra file với các exception chưa được xử lý — vì đây là lỗi nghiêm trọng
    this.logger.error(
      `[UnhandledException] ${message}`,
      undefined,
      correlationId,
      stack || '',
    );

    // Không bao giờ để lộ stack trace hay thông tin nội bộ ra ngoài cho client
    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
