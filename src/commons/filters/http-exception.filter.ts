import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoggerService } from '../logger/logger.service';
import { getCorrelationId } from '../middlewares/correlation-id.middleware';

@Catch(HttpException)
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new LoggerService(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const correlationId = getCorrelationId(request);

    // Lấy message — xử lý cả trường hợp string và array (ValidationPipe trả về array)
    let message: string | string[] = exception.message;
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const errorObject = exceptionResponse as Record<string, unknown>;
      if (Array.isArray(errorObject.message)) {
        message = errorObject.message as string[];
      } else if (typeof errorObject.message === 'string') {
        message = errorObject.message;
      }
    }

    // Multer trả lỗi "Unexpected field" khá khó hiểu, viết lại message cho rõ ràng hơn với user
    if (typeof message === 'string' && message.startsWith('Unexpected field')) {
      if (message.includes('gallery')) {
        message = 'Pet gallery supports up to 4 images (field: gallery).';
      } else if (message.includes('avatar')) {
        message = 'Only one avatar file is allowed (field: avatar).';
      }
    }

    // Lỗi 500 thì ghi log ra file (quan trọng), lỗi khác chỉ log ra console
    if (status >= 500) {
      this.logger.error(
        exception.message,
        undefined,
        correlationId,
        exception.stack || '',
      );
    } else {
      this.logger.errorConsoleOnly(exception.message, undefined, correlationId);
    }

    // Định dạng response chuẩn hóa — đồng nhất với CustomExceptionFilter
    response.status(status).json({
      statusCode: status,
      message,
      code: this.mapStatusToCode(status),
    });
  }

  /**
   * Map HTTP status sang mã lỗi chung
   * để đồng nhất định dạng response với CustomExceptionFilter.
   */
  private mapStatusToCode(status: number): string {
    const statusCodeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      408: 'REQUEST_TIMEOUT',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return statusCodeMap[status] || 'HTTP_ERROR';
  }
}
