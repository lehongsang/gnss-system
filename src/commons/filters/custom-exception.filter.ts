import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CustomException } from '../exceptions/custom.exception';
import { LoggerService } from '../logger/logger.service';
import { getCorrelationId } from '../middlewares/correlation-id.middleware';

@Catch(CustomException)
@Injectable()
export class CustomExceptionFilter implements ExceptionFilter {
  private readonly logger = new LoggerService(CustomExceptionFilter.name);

  catch(exception: CustomException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as Record<
      string,
      unknown
    >;
    const correlationId = getCorrelationId(request);

    // Log bất đồng bộ (Fire-and-Forget) - không chặn request
    this.logExceptionAsync(exception, correlationId);

    response.status(status).json({
      statusCode: status,
      message: exceptionResponse.message || exception.message,
      code: exceptionResponse.code,
    });
  }

  /**
   * Log exception bất đồng bộ - theo pattern Fire and Forget
   * Không await, không chặn request
   */
  private logExceptionAsync(
    exception: CustomException,
    correlationId: string,
  ): void {
    // Dùng setImmediate để đẩy việc log ra sau, không chặn request hiện tại
    setImmediate(() => {
      try {
        // Context đã được trích xuất sẵn trong constructor của CustomException
        const context = exception.context || 'Exception';
        this.logger.setContext(context);
        this.logger.error(
          exception.message,
          undefined,
          correlationId,
          exception.stack || '',
        );
      } catch {
        // eslint-disable-next-line no-console
        console.error('[LoggingError]', 'Failed to log exception');
      }
    });
  }
}
