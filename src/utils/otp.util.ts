import { randomInt } from 'crypto';

/**
 * Sinh mã OTP 6 chữ số bằng random số học mật mã (crypto).
 * An toàn hơn Math.random() vì kết quả không thể đoán trước được.
 * @returns Chuỗi OTP 6 chữ số (vd: "123456")
 */
export const generate6DigitOtp = (): string => {
  // randomInt(100000, 1000000) đảm bảo luôn đủ 6 chữ số, không bao giờ có số 0 ở đầu bị mất
  return randomInt(100000, 1000000).toString();
};
