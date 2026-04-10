import { randomBytes } from 'crypto';

/**
 * Generates a cryptographically secure 64-character registration token.
 * Uses 32 bytes of randomness converted to a hex string.
 * @returns {string} A 64-character hex string.
 */
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}
