/* eslint-disable */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * RedisService bọc lại ioredis để đơn giản hóa việc publish, subscribe
 * và quản lý key.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  /**
   * Client Redis dùng cho các lệnh chung.
   */
  public readonly client: Redis;

  /**
   * Client Redis riêng cho việc cache (get/set/setex).
   * Tách riêng khỏi pub/sub để tránh xung đột "subscriber mode".
   */
  public readonly cacheClient: Redis;

  /**
   * Client Redis dùng để publish message.
   */
  public readonly publisher: Redis;

  /**
   * Client Redis dùng để subscribe message.
   */
  public readonly subscriber: Redis;

  constructor(private readonly configService: ConfigService) {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      if (!redisUrl) {
        throw new Error('REDIS_URL is not defined in environment variables');
      }

      this.client = new Redis(redisUrl);
      // duplicate() tạo connection mới dùng chung config, cần tách riêng vì
      // subscriber mode và pub/sub sẽ chiếm dụng connection không cho chạy lệnh khác
      this.cacheClient = this.client.duplicate();
      this.publisher = this.client.duplicate();
      this.subscriber = this.client.duplicate();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Redis client: ${errorMessage}`);
    }
  }

  /**
   * Chờ tất cả kết nối Redis sẵn sàng trước khi cho module tiếp tục khởi động
   */
  async onModuleInit(): Promise<void> {
    try {
      // Đợi song song cả 4 client đều ready
      await Promise.all([
        this.waitForClientReady(this.client),
        this.waitForClientReady(this.cacheClient),
        this.waitForClientReady(this.publisher),
        this.waitForClientReady(this.subscriber),
      ]);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to establish Redis connections: ${errorMessage}`);
    }
  }

  /**
   * Chờ một client Redis chuyển sang trạng thái ready
   */
  private async waitForClientReady(client: Redis): Promise<void> {
    return new Promise((resolve, reject) => {
      if (client.status === 'ready') {
        resolve();
        return;
      }

      client.once('ready', () => resolve());
      client.once('error', reject);

      // Timeout sau 30 giây để tránh treo app mãi nếu Redis không kết nối được
      setTimeout(() => {
        client.removeListener('ready', resolve);
        client.removeListener('error', reject);
        reject(new Error('Redis connection timeout'));
      }, 30000);
    });
  }

  /**
   * Dọn dẹp kết nối Redis khi module bị destroy
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.all([
        this.client?.disconnect(),
        this.cacheClient?.disconnect(),
        this.publisher?.disconnect(),
        this.subscriber?.disconnect(),
      ]);
    } catch (error: unknown) {
      // Chỉ log lỗi chứ không throw, tránh chặn quá trình shutdown của app
      // Chỉ console.error ở môi trường non-production
      if (this.configService.get('NODE_ENV') !== 'production') {
        console.error('Error during Redis cleanup:', error);
      }
    }
  }

  /**
   * Chờ một message duy nhất từ một Redis channel.
   *
   * @param channel - Tên channel Redis
   * @param timeout - Thời gian chờ tối đa (ms), mặc định 5000ms
   * @returns Message nhận được, hoặc null nếu hết thời gian chờ
   */
  async waitForEvent(channel: string, timeout = 5000): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.subscriber.removeListener('message', onMessage);
          resolve(null);
        }
      }, timeout);

      const onMessage = (receivedChannel: string, message: string): void => {
        // subscriber dùng chung 1 listener cho mọi channel nên phải tự lọc đúng channel cần đợi
        if (receivedChannel === channel && !isResolved) {
          isResolved = true;
          clearTimeout(timer);
          this.subscriber.removeListener('message', onMessage);
          resolve(message);
        }
      };

      // Subscribe channel trước khi gắn listener
      this.subscriber.subscribe(channel).catch((error: unknown) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          // Chỉ console.error ở môi trường non-production
          if (this.configService.get('NODE_ENV') !== 'production') {
            console.error(`Failed to subscribe to channel ${channel}:`, error);
          }
          resolve(null);
        }
      });

      this.subscriber.on('message', onMessage);
    });
  }

  /**
   * Xóa toàn bộ key khớp với pattern prefix cho trước.
   *
   * Dùng script Lua chạy SCAN (thay vì KEYS) theo từng batch 1000 key để tránh
   * block Redis khi dataset lớn, sau đó DEL từng key và đếm tổng số đã xóa.
   *
   * @param prefix - Pattern để match key (vd: "orders:*")
   * @returns Số lượng key đã bị xóa
   */
  public async removeKeyWithPrefix(prefix: string): Promise<number> {
    try {
      const luaScript = `
        local keys = redis.call('SCAN', '0', 'MATCH', ARGV[1], 'COUNT', 1000)
        local deleted = 0
        local cursor = keys[1]
        local keyList = keys[2]
        for i = 1, #keyList do
          redis.call('DEL', keyList[i])
          deleted = deleted + 1
        end
        while cursor ~= '0' do
          keys = redis.call('SCAN', cursor, 'MATCH', ARGV[1], 'COUNT', 1000)
          cursor = keys[1]
          keyList = keys[2]
          for i = 1, #keyList do
            redis.call('DEL', keyList[i])
            deleted = deleted + 1
          end
        end
        return deleted
      `;

      const result = await this.client.eval(luaScript, 0, prefix);
      const deleted = typeof result === 'number' ? result : 0;
      return deleted;
    } catch (error: unknown) {
      if (this.configService.get('NODE_ENV') !== 'production') {
        console.error(`Failed to remove keys with prefix ${prefix}:`, error);
      }
      return 0;
    }
  }

  /**
   * Publish một message tới Redis channel
   *
   * @param channel - Tên channel Redis
   * @param message - Nội dung message cần gửi
   * @returns Số lượng subscriber đã nhận được message
   */
  public async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(channel, message);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to publish message to channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Subscribe vào một Redis channel
   *
   * @param channel - Tên channel Redis
   * @param callback - Hàm xử lý message nhận được
   */
  public async subscribe(
    channel: string,
    callback: (channel: string, message: string) => void,
  ): Promise<void> {
    try {
      await this.subscriber.subscribe(channel);
      this.subscriber.on('message', callback);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to subscribe to channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Hủy subscribe khỏi một Redis channel
   *
   * @param channel - Tên channel Redis
   */
  public async unsubscribe(channel: string): Promise<void> {
    try {
      await this.subscriber.unsubscribe(channel);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to unsubscribe from channel ${channel}: ${errorMessage}`,
      );
    }
  }

  /**
   * Tăng giá trị key lên 1 (atomic)
   *
   * @param key - Tên key Redis
   * @returns Giá trị sau khi tăng
   */
  public async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to increment key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Giảm giá trị key đi 1 (atomic)
   *
   * @param key - Tên key Redis
   * @returns Giá trị sau khi giảm
   */
  public async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to decrement key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Lấy giá trị từ Redis
   *
   * @param key - Tên key Redis
   * @returns Giá trị, hoặc null nếu key không tồn tại
   */
  public async get(key: string): Promise<string | null> {
    try {
      return await this.cacheClient.get(key);
    } catch (error) {
      if (this.configService.get('NODE_ENV') !== 'production') {
        console.error(`Failed to get key ${key}:`, error);
      }
      return null;
    }
  }

  /**
   * Set giá trị vào Redis
   *
   * @param key - Tên key Redis
   * @param value - Giá trị cần set
   * @returns OK nếu thành công
   */
  public async set(
    key: string,
    value: string | number,
  ): Promise<string | null> {
    try {
      return await this.cacheClient.set(key, value.toString());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to set key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Set giá trị vào Redis kèm thời gian hết hạn (giây)
   *
   * @param key - Tên key Redis
   * @param seconds - Thời gian hết hạn tính bằng giây
   * @param value - Giá trị cần set
   * @returns OK nếu thành công
   */
  public async setex(
    key: string,
    seconds: number,
    value: string | number,
  ): Promise<string> {
    try {
      return await this.cacheClient.setex(key, seconds, value.toString());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to setex key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Xóa key khỏi Redis
   *
   * @param key - Tên key Redis
   * @returns Số key đã xóa (0 hoặc 1)
   */
  public async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Đặt thời gian hết hạn cho key, tính bằng giây
   *
   * @param key - Tên key Redis
   * @param seconds - Thời gian hết hạn tính bằng giây
   * @returns 1 nếu đặt thành công, 0 nếu key không tồn tại
   */
  public async expire(key: string, seconds: number): Promise<number> {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to set expire for key ${key}: ${errorMessage}`);
    }
  }

  /**
   * Đặt thời gian hết hạn cho key, tính bằng mili giây
   *
   * @param key - Tên key Redis
   * @param milliseconds - Thời gian hết hạn tính bằng mili giây
   * @returns 1 nếu đặt thành công, 0 nếu key không tồn tại
   */
  public async pexpire(key: string, milliseconds: number): Promise<number> {
    try {
      return await this.client.pexpire(key, milliseconds);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to set pexpire for key ${key}: ${errorMessage}`);
    }
  }
}
