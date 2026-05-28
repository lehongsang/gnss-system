import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { DataSource } from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { Account } from '@/modules/auth/entities/account.entity';
import { Device } from '@/modules/devices/entities/device.entity';
import { Geofence } from '@/modules/geofences/entities/geofence.entity';
import {
  Role,
  DeviceStatusEnum,
  AccuracyStatus,
  MediaType,
  AlertType,
} from '@/commons/enums/app.enum';
import { Logger } from '@nestjs/common';
import { hashPassword } from 'better-auth/crypto';
import { v7 as uuidv7 } from 'uuid';
import { DeviceStatus } from '@/modules/device-status/entities/device-status.entity';
import { Telemetry } from '@/modules/telemetry/entities/telemetry.entity';
import { MediaLog } from '@/modules/media-logs/entities/media-log.entity';
import { Alert } from '@/modules/alerts/entities/alert.entity';
import * as bcrypt from 'bcryptjs';

async function bootstrap() {
  const logger = new Logger('Seeder');
  logger.log('Initializing Application Context for Seeding...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const dataSource = app.get(DataSource);

  const userRepo = dataSource.getRepository(User);
  const accountRepo = dataSource.getRepository(Account);
  const deviceRepo = dataSource.getRepository(Device);
  const geofenceRepo = dataSource.getRepository(Geofence);

  // Users to seed
  const usersToSeed = [
    {
      email: 'admin@gnss.com',
      name: 'Admin GNSS',
      role: Role.ADMIN,
      password: 'password123',
      phoneNumber: '0901234567',
    },
    {
      email: 'user1@gnss.com',
      name: 'User One',
      role: Role.USER,
      password: 'password123',
      phoneNumber: '0901234568',
    },
    {
      email: 'user2@gnss.com',
      name: 'User Two',
      role: Role.USER,
      password: 'password123',
      phoneNumber: '0901234569',
    },
  ];

  logger.log('Seeding users...');
  const createdUsers: User[] = [];

  for (const userData of usersToSeed) {
    const existingUser = await userRepo.findOne({
      where: { email: userData.email },
    });
    if (!existingUser) {
      const newUser = userRepo.create({
        id: uuidv7(),
        email: userData.email,
        name: userData.name,
        role: userData.role,
        emailVerified: true,
        phoneNumber: userData.phoneNumber,
      });
      await userRepo.save(newUser);
      createdUsers.push(newUser);

      // Create account (for better-auth)
      const hashedPassword = await hashPassword(userData.password);
      const newAccount = accountRepo.create({
        id: uuidv7(),
        user: newUser,
        accountId: newUser.id, // better-auth uses user.id as accountId for credential provider
        providerId: 'credential',
        password: hashedPassword,
      });
      await accountRepo.save(newAccount);
      logger.log(`Created user: ${userData.email}`);
    } else {
      logger.log(`User already exists: ${userData.email}`);
      createdUsers.push(existingUser);
    }
  }

  logger.log('Seeding devices...');
  const devicesToSeed = [
    {
      name: 'Device A - Tracker',
      speedLimitKmh: 80,
    },
    {
      name: 'Device B - Monitor',
      speedLimitKmh: 60,
    },
    {
      name: 'Device C - Admin',
      speedLimitKmh: 100,
    },
  ];

  const createdDevices: Device[] = [];

  for (let i = 0; i < devicesToSeed.length; i++) {
    const deviceData = devicesToSeed[i];
    const existingDevice = await deviceRepo.findOne({
      where: { name: deviceData.name },
    });
    const plainPassword = 'mqtt_password_123';
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    if (!existingDevice) {
      // Assign devices to users: Device A and B to user1, Device C to admin
      const owner =
        i < 2
          ? createdUsers.find((u) => u.email === 'user1@gnss.com')
          : createdUsers.find((u) => u.email === 'admin@gnss.com');

      const deviceId = uuidv7();
      const newDevice = deviceRepo.create({
        id: deviceId,
        name: deviceData.name,
        speedLimitKmh: deviceData.speedLimitKmh,
        owner: owner,
        mqttUsername: `device:${deviceId}`,
        mqttPasswordHash: hashedPassword,
        mqttCredentialsIssuedAt: new Date(),
      });
      await deviceRepo.save(newDevice);
      createdDevices.push(newDevice);
      logger.log(`Created device: ${deviceData.name} (MQTT Username: device:${deviceId}, Password: ${plainPassword})`);
    } else {
      existingDevice.mqttUsername = `device:${existingDevice.id}`;
      existingDevice.mqttPasswordHash = hashedPassword;
      existingDevice.mqttCredentialsIssuedAt = new Date();
      await deviceRepo.save(existingDevice);
      
      createdDevices.push(existingDevice);
      logger.log(`Device already exists, updated MQTT credentials: ${deviceData.name} (MQTT Username: device:${existingDevice.id}, Password: ${plainPassword})`);
    }
  }

  logger.log('Seeding device statuses and telemetry...');
  const deviceStatusRepo = dataSource.getRepository(DeviceStatus);
  const telemetryRepo = dataSource.getRepository(Telemetry);

  const statuses = [
    DeviceStatusEnum.ONLINE,
    DeviceStatusEnum.OFFLINE,
    DeviceStatusEnum.MAINTENANCE,
  ];
  for (let i = 0; i < createdDevices.length; i++) {
    const device = createdDevices[i];

    // Status
    const existingStatus = await deviceStatusRepo.findOne({
      where: { deviceId: device.id },
    });
    if (!existingStatus) {
      await deviceStatusRepo.save({
        deviceId: device.id,
        status: statuses[i % statuses.length],
        batteryLevel: Math.floor(Math.random() * 50) + 50,
        cameraStatus: true,
        gnssStatus: true,
      });
    }

    // Telemetry (Historical Data)
    const telemetryCount = await telemetryRepo.count({
      where: { deviceId: device.id },
    });
    if (telemetryCount < 400) {
      await telemetryRepo.delete({ deviceId: device.id });
      const telemetryPoints = [];
      let currentLat = 21.0285 + (Math.random() * 0.1 - 0.05);
      let currentLng = 105.8542 + (Math.random() * 0.1 - 0.05);
      const currentTime = new Date();

      const numPoints = 432;
      for (let j = 0; j < numPoints; j++) {
        telemetryPoints.push({
          id: uuidv7(),
          deviceId: device.id,
          timestamp: new Date(currentTime.getTime() - (numPoints - j) * 600000), // 10 minute intervals
          lat: currentLat,
          lng: currentLng,
          speed: Math.floor(Math.random() * 60) + 10,
          heading: Math.floor(Math.random() * 360),
          accuracyStatus: AccuracyStatus.GNSS_ONLY,
        });
        currentLat += (Math.random() - 0.5) * 0.002;
        currentLng += (Math.random() - 0.5) * 0.002;
      }
      // Save in chunks to avoid query limits
      for (let i = 0; i < telemetryPoints.length; i += 100) {
        await telemetryRepo.save(telemetryPoints.slice(i, i + 100));
      }
      await dataSource.query(
        `UPDATE telemetry SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE device_id = $1 AND geom IS NULL`,
        [device.id],
      );
      logger.log(
        `Seeded ${numPoints} telemetry points for device ${device.name}`,
      );
    }

    // Media Logs
    const mediaLogRepo = dataSource.getRepository(MediaLog);
    await mediaLogRepo.delete({ deviceId: device.id });
    const mediaLogs = [];
    const currentTime = new Date();
    for (let j = 0; j < 15; j++) {
      const isImage = Math.random() > 0.2;
      const timestamp = new Date(
        currentTime.getTime() - Math.random() * 3 * 24 * 3600 * 1000,
      );
      mediaLogs.push({
        id: uuidv7(),
        deviceId: device.id,
        startTime: timestamp,
        endTime: timestamp,
        mediaType: isImage ? MediaType.IMAGE_FRAME : MediaType.VIDEO_CHUNK,
        s3Key: `mock/${device.id}-${j}`,
        fileUrl: isImage
          ? `https://loremflickr.com/800/600/street,traffic,car?lock=${Math.floor(Math.random() * 1000)}`
          : 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      });
    }
    await mediaLogRepo.save(mediaLogs);
    logger.log(`Seeded media logs for device ${device.name}`);

    // Alerts
    const alertRepo = dataSource.getRepository(Alert);
    const alertCount = await alertRepo.count({
      where: { deviceId: device.id },
    });
    if (alertCount === 0) {
      const alertTypes = [
        AlertType.TRAJECTORY_DEVIATION,
        AlertType.DANGEROUS_OBSTACLE,
        AlertType.SIGNAL_LOST,
        AlertType.GEOFENCE_EXIT,
        AlertType.SPEEDING,
      ];
      const alerts = [];
      for (let j = 0; j < 3; j++) {
        alerts.push({
          id: uuidv7(),
          deviceId: device.id,
          alertType: alertTypes[Math.floor(Math.random() * alertTypes.length)],
          message: `Mock alert message ${j + 1} for testing.`,
          lat: 21.0285 + (Math.random() * 0.1 - 0.05),
          lng: 105.8542 + (Math.random() * 0.1 - 0.05),
          isResolved: Math.random() > 0.5,
          createdAt: new Date(Date.now() - Math.random() * 86400000), // Within last 24h
        });
      }
      await alertRepo.save(alerts);
      logger.log(`Seeded alerts for device ${device.name}`);
    }
  }

  logger.log('Seeding geofences...');
  // Only insert if no geofences exist to avoid duplicate polygon issues
  const geofenceCount = await geofenceRepo.count();
  if (geofenceCount === 0) {
    const adminUser = createdUsers.find((u) => u.email === 'admin@gnss.com');
    const user1 = createdUsers.find((u) => u.email === 'user1@gnss.com');

    // Sample polygon coordinates in format: SRID=4326;POLYGON((lon lat, lon lat, ...))
    const hcmPolygon =
      'SRID=4326;POLYGON((106.6 10.7, 106.7 10.7, 106.7 10.8, 106.6 10.8, 106.6 10.7))';
    const hnPolygon =
      'SRID=4326;POLYGON((105.8 21.0, 105.9 21.0, 105.9 21.1, 105.8 21.1, 105.8 21.0))';

    if (adminUser) {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into(Geofence)
        .values({
          id: uuidv7(),
          name: 'HCM City Area',
          creator: adminUser,
          geom: () => `ST_GeomFromEWKT('${hcmPolygon}')`,
        })
        .execute();
    }

    if (user1) {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into(Geofence)
        .values({
          id: uuidv7(),
          name: 'Hanoi Area',
          creator: user1,
          geom: () => `ST_GeomFromEWKT('${hnPolygon}')`,
        })
        .execute();
    }

    logger.log(`Created sample geofences`);
  } else {
    logger.log('Geofences already exist, skipping.');
  }

  logger.log('Seeding completed successfully!');
  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error seeding data:', err);
  process.exit(1);
});
