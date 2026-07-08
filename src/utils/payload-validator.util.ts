import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Helper validate chặt các payload JSON đầu vào (vd: từ MQTT hoặc Kafka)
 * bằng DTO class-validator.
 * Chặn payload lỗi hoặc cố tình gửi sai định dạng trước khi chạm tới database.
 */
export class PayloadValidator {
  /**
   * Validate 1 object đã parse với DTO tương ứng.
   * Trả về instance DTO đã validate nếu hợp lệ, ngược lại throw lỗi chi tiết.
   *
   * @param dtoClass - Constructor của DTO đích (vd: CreateDeviceDto)
   * @param rawObject - Object JSON thô đã parse, chưa qua kiểm tra
   * @returns Promise trả về DTO instance đã được khởi tạo đầy đủ
   */
  static async validate<T extends object>(
    dtoClass: new () => T,
    rawObject: unknown,
  ): Promise<T> {
    if (typeof rawObject !== 'object' || rawObject === null) {
      throw new Error('Payload is not a valid JSON object');
    }

    // whitelist: true tự động bỏ field không khai báo trong DTO, tránh payload thừa/rác
    const instance = plainToInstance(dtoClass, rawObject);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const messages = errors
        .map((err) => {
          const constraints = err.constraints
            ? Object.values(err.constraints).join(', ')
            : 'Invalid value';
          return `${err.property}: ${constraints}`;
        })
        .join('; ');
      throw new Error(`Validation failed: ${messages}`);
    }

    return instance;
  }
}
