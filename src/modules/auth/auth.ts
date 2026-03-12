import { AUTH_IGNORE_ROUTERS } from '@/commons/constants/app.constants';
import { Role } from '@/commons/enums/app.enum';
import { betterAuth } from 'better-auth';
import { admin, openAPI, jwt, bearer } from 'better-auth/plugins';
import { v7 as uuidv7 } from 'uuid';
import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';

export const getAuth = (database: Pool, configService: ConfigService) =>
  betterAuth({
    database: database,
    baseURL:
      configService.get<string>('BETTER_AUTH_BASE_URL')?.trim() ||
      'http://localhost:3000/api/auth',
    secret: configService.get<string>('BETTER_AUTH_SECRET'),
    logger: {
      enabled: true,
      level: 'debug',
    },
    plugins: [
      admin({
        defaultRole: Role.USER,
        adminRoles: [Role.ADMIN],
      }),
      openAPI({
        path: '/docs',
      }),
      jwt(),
      bearer(),
    ],
    socialProviders: {
      google: {
        clientId: configService.get<string>('GOOGLE_CLIENT_ID', ''),
        clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
      },
      facebook: {
        clientId: configService.get<string>('FACEBOOK_CLIENT_ID', ''),
        clientSecret: configService.get<string>('FACEBOOK_CLIENT_SECRET', ''),
      },
    },
    trustedOrigins: ['*'],
    advanced: {
      useSecureCookies: false, // Allow HTTP in local
      disableCSRFCheck: true, // Disable CSRF for local dev
      database: {
        generateId: () => uuidv7(),
      },
      cookies: {
        session_token: {
          name: 'session',
          attributes: {
            httpOnly: true,
            sameSite: 'lax',
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
      storage: 'memory',
      modelName: 'auth-rate-limit',
    },
    emailAndPassword: {
      enabled: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        strategy: 'jwt',
      },
      freshAge: 10,
      modelName: 'sessions', // fallback model
    },
    disabledPaths: AUTH_IGNORE_ROUTERS,
    user: {
      modelName: 'users',
      additionalFields: {
        role: {
          type: 'string',
          enum: Role,
          default: Role.USER,
        },
      },
    },
    account: {
      modelName: 'accounts',
      accountLinking: {
        enabled: true,
      },
    },
    verification: {
      modelName: 'verifications',
    },
  });
