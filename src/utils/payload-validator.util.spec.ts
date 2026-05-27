import { PayloadValidator } from './payload-validator.util';
import { TelemetryPayloadDto } from '@/modules/telemetry/dtos/telemetry-payload.dto';

describe('PayloadValidator', () => {
  /**
   * Test case: Should validate successfully with correct raw telemetry payload
   */
  it('should validate successfully with a correct payload', async () => {
    const validRaw = {
      deviceId: '019e4a45-b4aa-74ed-b5c2-484b89b18701',
      lng: 106.6958,
      lat: 10.7769,
      speed: 45.5,
      heading: 270,
      timestamp: '2026-05-20T10:00:00.000Z',
    };

    // Step-by-step logic: Run validation and verify returns instantiated DTO
    const result = await PayloadValidator.validate(
      TelemetryPayloadDto,
      validRaw,
    );

    expect(result).toBeInstanceOf(TelemetryPayloadDto);
    expect(result.deviceId).toBe(validRaw.deviceId);
    expect(result.lng).toBe(validRaw.lng);
    expect(result.lat).toBe(validRaw.lat);
  });

  /**
   * Test case: Should throw validation errors for invalid payloads (out of range lat/lng)
   */
  it('should throw validation error when payload properties are invalid', async () => {
    const invalidRaw = {
      deviceId: 'invalid-uuid-format',
      lng: 200, // Invalid longitude (> 180)
      lat: 100, // Invalid latitude (> 90)
      speed: -5, // Invalid speed (< 0)
      heading: 400, // Invalid heading (> 360)
      timestamp: 'invalid-date',
    };

    // Step-by-step logic: Expect validation to throw an error with detailed messages
    await expect(
      PayloadValidator.validate(TelemetryPayloadDto, invalidRaw),
    ).rejects.toThrow('Validation failed:');
  });

  /**
   * Test case: Should throw an error when raw object is null or not an object
   */
  it('should throw error when raw input is not a valid JSON object', async () => {
    await expect(
      PayloadValidator.validate(TelemetryPayloadDto, null),
    ).rejects.toThrow('Payload is not a valid JSON object');

    await expect(
      PayloadValidator.validate(TelemetryPayloadDto, 'string-payload'),
    ).rejects.toThrow('Payload is not a valid JSON object');
  });
});
