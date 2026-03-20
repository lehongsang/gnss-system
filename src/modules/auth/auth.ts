import { Role, UserStatus } from '@/commons/enums/app.enum';
import { betterAuth } from 'better-auth';
import {
  admin,
  jwt,
  bearer,
  twoFactor,
  multiSession,
  emailOTP,
  openAPI,
} from 'better-auth/plugins';
import { v7 as uuidv7 } from 'uuid';
import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { MailService } from '@/services/mail/mail.service';
import type { RedisService } from '@/services/redis/redis.service';

export type Auth = ReturnType<typeof getAuth>;

export const getAuth = (
  database: Pool,
  configService: ConfigService,
  mailService: MailService,
  redisService: RedisService,
) =>
  betterAuth({
    database,
    baseURL:
      configService.get<string>('BETTER_AUTH_BASE_URL')?.trim() ||
      'http://localhost:3000/api/auth',
    secret: configService.get<string>('BETTER_AUTH_SECRET'),
    logger: { disabled: false, level: 'debug' },
    secondaryStorage: redisService
      ? {
          get: async (key: string) => redisService.get(key),
          set: async (key: string, value: string, ttl?: number) => {
            if (ttl) {
              await redisService.setex(key, ttl, value);
            } else {
              await redisService.set(key, value);
            }
          },
          delete: async (key: string) => {
            await redisService.del(key);
          },
        }
      : undefined,
    plugins: [
      admin({ defaultRole: Role.USER, adminRoles: [Role.ADMIN] }),
      jwt(),
      bearer(),
      multiSession(),
      twoFactor({
        issuer: configService.get<string>('APP_NAME', 'Nest Base'),
        skipVerificationOnEnable: false,
        otpOptions: {
          digits: 6,
          period: 300,
          sendOTP: async ({
            user,
            otp,
          }: {
            user: { email: string };
            otp: string;
          }) => {
            await mailService.sendOtp(user.email, otp);
          },
        },
      }),
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await mailService.sendOtp(email, otp);
        },
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: false,
        expiresIn: 300,
      }),
      openAPI({ path: '/docs' }),
    ],
    socialProviders: {
      google: {
        clientId: configService.get<string>('GOOGLE_CLIENT_ID', ''),
        clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
        prompt: 'select_account',
      },
      apple: {
        clientId: configService.get<string>('APPLE_CLIENT_ID', ''),
        clientSecret: configService.get<string>('APPLE_CLIENT_SECRET', ''),
        teamId: configService.get<string>('APPLE_TEAM_ID', ''),
        keyId: configService.get<string>('APPLE_KEY_ID', ''),
        privateKey: configService.get<string>('APPLE_PRIVATE_KEY', ''),
      },
    },
    trustedOrigins: [
      configService.get<string>('FRONTEND_URL', 'http://localhost:5173'),
      'http://localhost:3000',
    ],
    advanced: {
      useSecureCookies: configService.get<string>('NODE_ENV') === 'production',
      disableCSRFCheck: configService.get<string>('NODE_ENV') !== 'production',
      database: {
        generateId: () => uuidv7(),
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: 'secondary-storage',
      modelName: 'authRateLimit',
      customRules: {
        // Send OTP Verification Email (Sign Up)
        '/email-otp/send-verification-otp': {
          window: 60,
          max: 1,
        },
        // Send OTP Login
        '/email-otp/send-otp': {
          window: 60,
          max: 1,
        },
        // Send OTP two-factor
        '/two-factor/send-otp': {
          window: 60,
          max: 1,
        },
        // Sign Up Email
        '/sign-up/email': {
          window: 60,
          max: 1,
        },
        // Sign In Email
        '/sign-in/email': {
          window: 60,
          max: 5,
        },
        // Sign Up Google
        '/sign-up/google': {
          window: 60,
          max: 5,
        },
        // Sign Up Apple
        '/sign-up/apple': {
          window: 60,
          max: 5,
        },
        // Forgot Password
        '/forgot-password': {
          window: 60,
          max: 1,
        },
        // Reset Password
        '/reset-password': {
          window: 60,
          max: 1,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      sendResetPassword: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await mailService.sendPasswordReset(user.email, url);
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
    },
    session: {
      cookieCache: { enabled: true, maxAge: 300 },
      expiresIn: 2592000, // 30 days
      updateAge: 86400,
      freshAge: 600,
      modelName: 'session',
    },
    user: {
      modelName: 'user',
      additionalFields: {
        role: { type: 'string', defaultValue: Role.USER },
        twoFactorEnabled: { type: 'boolean', defaultValue: false },
        mediaId: { type: 'string' },
        status: { type: 'string', defaultValue: UserStatus.ACTIVE },
        banned: { type: 'boolean', defaultValue: false },
        banReason: { type: 'string' },
        banExpires: { type: 'date' },
      },
    },
    twoFactor: {
      modelName: 'twoFactor',
    },
    jwks: {
      modelName: 'jwks',
    },
    account: {
      modelName: 'account',
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
      },
    },
    verification: {
      modelName: 'verification',
    },
  });
