import { randomBytes } from 'crypto';

/**
 * Sinh token đăng ký 64 ký tự bằng random mật mã an toàn.
 * Dùng 32 byte ngẫu nhiên rồi chuyển sang chuỗi hex (mỗi byte = 2 ký tự hex).
 * @returns {string} Chuỗi hex dài 64 ký tự.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}
