import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly prefix = 'distributed-lock';

  constructor(private redisService: RedisService) {}
  /**
   * @deprecated Dùng withLock() thay thế. Method này có race condition.
   */
  public async lockWithTimeOut(key: string, ttl: number): Promise<boolean> {
    this.logger.warn(
      `lockWithTimeOut is deprecated. Use withLock() instead for key: ${key}`,
    );
    return this.acquireLock(key, ttl);
  }

  /**
   * Kiểm tra xem key có đang bị khóa hay không.
   *
   * @param key - Key cần kiểm tra.
   * @returns true nếu chưa bị lock, false nếu đang bị lock.
   */

  public async isWithoutLock(key: string): Promise<boolean> {
    const lockValue = await this.redisService.client.get(
      `${this.prefix}:${key}`,
    );
    return !lockValue;
  }
  /**
   * Giành lock cho key với TTL cho trước, dùng lệnh Redis SET NX PX.
   *
   * Dùng SET nguyên tử với NX (chỉ set nếu chưa tồn tại) và PX (TTL theo ms)
   * để đảm bảo giành lock không bị race condition giữa nhiều tiến trình.
   *
   * @param key - Key dùng làm lock.
   * @param ttl - Thời gian sống của lock, tính bằng ms.
   * @returns true nếu giành được lock, false nếu không.
   */
  public async acquireLock(key: string, ttl: number): Promise<boolean> {
    const lockValue = Date.now().toString();
    const result = await this.redisService.client.set(
      `${this.prefix}:${key}`,
      lockValue,
      'PX',
      ttl,
      'NX',
    );
    return result === 'OK';
  }

  /**
   * Giải phóng lock ứng với key đã cho.
   *
   * Xóa entry lock khỏi Redis để các tiến trình khác có thể giành lock lại.
   *
   * @param key - Key của lock cần giải phóng.
   */
  private async releaseLock(key: string): Promise<void> {
    await this.redisService.client.del(`${this.prefix}:${key}`);
  }

  /**
   * Chạy một hàm dưới sự bảo vệ của distributed lock.
   *
   * Giành lock, thực thi action, và đảm bảo lock luôn được giải phóng dù
   * action có throw lỗi hay không. Nếu không giành được lock thì trả về null
   * (không throw, để caller tự quyết định xử lý tiếp thế nào).
   *
   * @param key - Key dùng làm lock.
   * @param ttl - Thời gian sống của lock, tính bằng ms.
   * @param action - Hàm cần thực thi khi đã giành được lock.
   * @returns Kết quả của action nếu giành được lock, ngược lại là null.
   */
  async withLock<T>(
    key: string,
    ttl: number,
    action: () => Promise<T>,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(key, ttl);

    if (!acquired) {
      this.logger.warn(`Failed to acquire lock for key: ${key}`);
      return null;
    }

    try {
      this.logger.debug(`Lock acquired for key: ${key}`);
      const result = await action();
      this.logger.debug(`Lock released for key: ${key}`);
      return result;
    } catch (error) {
      this.logger.error(`Error executing action for lock key: ${key}`, error);
      throw error;
    } finally {
      await this.releaseLock(key);
    }
  }
}
