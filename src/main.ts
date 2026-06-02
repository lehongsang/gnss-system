import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { json } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { SanitizeRequestPipe } from './commons/pipes/sanitize-request.pipe';

import {
  API_GLOBAL_PREFIX,
  APP_NAME,
  DEFAULT_PORT,
} from './commons/constants/app.constants';
import * as path from 'path';
import * as fs from 'fs';
import { LoggerService } from './commons/logger/logger.service';
import { correlationIdMiddleware } from './commons/middlewares/correlation-id.middleware';

async function bootstrap() {
  // suppressBetterAuthLogs();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(LoggerService));
  app.set('query parser', 'extended');
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', frontendUrl || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Configure CORS
  app.enableCors({
    origin: isProduction && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  // Register correlation ID middleware - Must be before all other middleware for proper tracking
  app.use(correlationIdMiddleware);
  app.use('/api/mqtt/auth', json({ limit: '10kb' }));

  // Configure global guards
  const reflector = app.get<Reflector>(Reflector);

  // Configure cookie parser
  app.use(cookieParser());
  // Compress responses
  app.use(compression());
  // Configure global validation
  app.useGlobalPipes(
    new SanitizeRequestPipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  // Configure global interceptors
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));
  // Configure global prefix
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: [`/${API_GLOBAL_PREFIX}/auth/*path`, '/'],
  });

  const swaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED') === 'true' || !isProduction;
  const openApiOutputEnabled =
    configService.get<string>('GENERATE_OPENAPI') === 'true' || !isProduction;

  if (swaggerEnabled || openApiOutputEnabled) {
    const config = new DocumentBuilder()
      .setTitle(APP_NAME)
      .setDescription('API documentation for the GNSS System backend.')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'bearer',
      )
      .setExternalDoc('Authentication Docs', 'auth/docs')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);

    if (swaggerEnabled) {
      SwaggerModule.setup(`${API_GLOBAL_PREFIX}/docs`, app, documentFactory, {
        swaggerOptions: {
          persistAuthorization: true,
        },
      });
    }

    if (openApiOutputEnabled) {
      const pathOutputOpenApi = './open-api.json';
      const directoryPath = path.dirname(pathOutputOpenApi);
      if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
      }
      fs.writeFileSync(pathOutputOpenApi, JSON.stringify(documentFactory()));
    }
  }

  const port =
    configService.get<number>('APP_PORT') ??
    configService.get<number>('PORT') ??
    DEFAULT_PORT;
  await app.listen(port);
  const logger = new Logger('Application');
  logger.log(`Application is running on url http://localhost:${port}`);
}
void bootstrap();
