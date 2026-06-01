/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/services/redis/redis.service';
import { KafkaService } from '../src/services/kafka/kafka.service';
import { StorageService } from '../src/services/storage/storage.service';
import { MqttService } from '../src/services/mqtt/mqtt.service';
import { MailService } from '../src/services/mail/mail.service';
import { MediaServerService } from '../src/services/media-server/media-server.service';
import { RedisLockService } from '../src/services/redis/distributed-lock.service';

jest.mock('@thallesp/nestjs-better-auth', () => {
  class MockAuthService {
    api = {
      signUpEmail: jest.fn().mockResolvedValue({ user: { id: 'admin-id' } }),
      signInEmail: jest.fn().mockResolvedValue({ user: { id: 'admin-id' } }),
    };
  }

  return {
    AuthGuard: jest.fn().mockImplementation(() => ({
      canActivate: () => true,
    })),
    AuthModule: {
      forRootAsync: jest.fn().mockReturnValue({
        module: class MockModule {},
        providers: [
          {
            provide: MockAuthService,
            useClass: MockAuthService,
          },
        ],
        exports: [
          {
            provide: MockAuthService,
            useClass: MockAuthService,
          },
        ],
        global: true,
      }),
    },
    AllowAnonymous: () => jest.fn(),
    Roles: () => jest.fn(),
    Session: () => jest.fn(),
    ActiveUser: () => jest.fn(),
    AuthService: MockAuthService,
  };
});

jest.mock('@nestjs/typeorm', () => {
  const actual = jest.requireActual('@nestjs/typeorm');
  const typeOrmModule = actual.TypeOrmModule;
  typeOrmModule.forRoot = () => ({
    module: typeOrmModule,
    providers: [
      {
        provide: DataSource,
        useValue: {
          options: { entities: [] },
          entityMetadatas: [],
        },
      },
    ],
    exports: [DataSource],
    global: true,
  });
  typeOrmModule.forRootAsync = () => ({
    module: typeOrmModule,
    providers: [
      {
        provide: DataSource,
        useValue: {
          options: { entities: [] },
          entityMetadatas: [],
        },
      },
    ],
    exports: [DataSource],
    global: true,
  });
  return {
    ...actual,
    TypeOrmModule: typeOrmModule,
  };
});

jest.mock('better-auth', () => ({
  betterAuth: jest.fn().mockReturnValue({
    handler: jest.fn(),
    api: {},
  }),
}));

jest.mock('better-auth/plugins', () => ({
  admin: jest.fn(),
  jwt: jest.fn(),
  bearer: jest.fn(),
  twoFactor: jest.fn(),
  multiSession: jest.fn(),
  emailOTP: jest.fn(),
  openAPI: jest.fn(),
  phoneNumber: jest.fn(),
}));

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  // Mock database and network providers to prevent timeout / connection errors
  const mockRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
      getCount: jest.fn().mockResolvedValue(0),
    }),
  };

  const mockDataSource = {
    options: { entities: [] },
    entityMetadatas: [],
    getRepository: jest.fn().mockReturnValue(mockRepository),
    query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    runMigrations: jest.fn().mockResolvedValue([]),
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {},
    }),
  };

  const mockPgPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
  };

  const mockRedisService = {
    client: {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    },
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  };

  const mockKafkaService = {
    produce: jest.fn().mockResolvedValue(null),
    consume: jest.fn().mockResolvedValue(null),
  };

  const mockStorageService = {
    uploadFile: jest.fn().mockResolvedValue({ s3Key: 'mock-key', url: 'http://mock-url' }),
    deleteFile: jest.fn().mockResolvedValue(null),
  };

  const mockMqttService = {
    publish: jest.fn().mockResolvedValue(null),
    subscribe: jest.fn().mockResolvedValue(null),
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(null),
  };

  const mockMediaServerService = {
    createSession: jest.fn().mockResolvedValue(null),
    closeSession: jest.fn().mockResolvedValue(null),
  };

  const mockRedisLockService = {
    acquireLock: jest.fn().mockResolvedValue(true),
    withLock: jest.fn().mockImplementation((key, ttl, action) => action()),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DataSource)
      .useValue(mockDataSource)
      .overrideProvider('PG_POOL')
      .useValue(mockPgPool)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(KafkaService)
      .useValue(mockKafkaService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideProvider(MqttService)
      .useValue(mockMqttService)
      .overrideProvider(MailService)
      .useValue(mockMailService)
      .overrideProvider(MediaServerService)
      .useValue(mockMediaServerService)
      .overrideProvider(RedisLockService)
      .useValue(mockRedisLockService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api'); // Match main.ts configuration
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer() as unknown as App)
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeDefined();
        expect(res.body.status).toBe('ok');
      });
  });
});
