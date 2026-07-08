import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../../services/redis/redis.service';
import { RATE_LIMIT_METADATA } from '../decorators/rate-limit.decorator';

/**
 * Guard giới hạn tần suất request để chống lạm dụng API
 * Giới hạn theo từng user hoặc theo địa chỉ IP
 *
 * Cách dùng:
 *
 * 1. Giới hạn mặc định (10 request mỗi 60 giây):
 * @RateLimit()
 *
 * 2. Tùy chỉnh giới hạn:
 * @RateLimit({ limit: 50, ttl: 30 })
 */
@Injectable()
export class CustomRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(CustomRateLimitGuard.name);
  private readonly defaultLimit = 100;
  private readonly defaultTtl = 60; // đơn vị giây

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const decoratorOptions = this.reflector.get<{
      limit?: number;
      ttl?: number;
      key?: string;
    }>(RATE_LIMIT_METADATA, context.getHandler());

    const limit = decoratorOptions?.limit || this.defaultLimit;
    const ttl = decoratorOptions?.ttl || this.defaultTtl;

    const request = context.switchToHttp().getRequest<Request>();
    const identifier = this.getIdentifier(request);

    // Dùng key tùy chỉnh nếu có, không thì dùng key mặc định theo class + handler
    const throttleKey =
      decoratorOptions?.key ||
      `${context.getClass().name}.${context.getHandler().name}`;
    const key = `throttle:${throttleKey}:${identifier}`;

    try {
      const current = await this.redisService.incr(key); // tăng đếm nguyên tử (atomic)

      if (current === 1) {
        // Chỉ set TTL ở request đầu tiên để bắt đầu tính cửa sổ thời gian
        await this.redisService.expire(key, ttl);
      }

      if (current > limit) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Too many requests. Max ${limit} requests per ${ttl} seconds.`,
            retryAfter: ttl,
          },
          HttpStatus.TOO_MANY_REQUESTS,
          { cause: { retryAfter: ttl } },
        );
      }

      // Gắn thông tin rate limit vào request để dùng sau này (ví dụ trả về header)
      request.rateLimit = {
        limit,
        current,
        remaining: limit - current,
        resetTime: Date.now() + ttl * 1000,
      };

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Nếu Redis lỗi thì cho request đi qua luôn, tránh block toàn bộ hệ thống vì Redis down
      this.logger.warn(
        `Rate limit check failed for ${identifier}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return true;
    }
  }

  /**
   * Lấy định danh để giới hạn tần suất
   * Ưu tiên: userId (nếu đã đăng nhập) > địa chỉ IP
   */
  private getIdentifier(request: Request): string {
    // Nếu đã xác thực thì giới hạn theo user
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    // Nếu chưa thì giới hạn theo IP
    const ip =
      request.ip ||
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.socket.remoteAddress ||
      'unknown';

    return `ip:${ip}`;
  }
}
