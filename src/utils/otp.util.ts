import { randomInt } from 'crypto';

export const generate6DigitOtp = (): string => {
  return randomInt(100000, 1000000).toString();
};
