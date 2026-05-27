import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Utility helper to strictly validate incoming JSON payloads (e.g. from MQTT or Kafka)
 * using class-validator DTOs.
 * Prevents corrupted or malicious payloads from entering database operations.
 */
export class PayloadValidator {
  /**
   * Statically validates a raw parsed object against a class DTO.
   * Returns the validated DTO instance if valid, or throws a detailed error.
   *
   * @param dtoClass - The class constructor of the target DTO (e.g., CreateDeviceDto)
   * @param rawObject - The raw parsed JSON tệp tin
   * @returns A promise resolving to the fully instantiated DTO
   */
  static async validate<T extends object>(
    dtoClass: new () => T,
    rawObject: unknown,
  ): Promise<T> {
    if (typeof rawObject !== 'object' || rawObject === null) {
      throw new Error('Payload is not a valid JSON object');
    }

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
