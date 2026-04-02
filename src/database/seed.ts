import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const logger = new Logger('Seeder');
  // Build a NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    logger.log('Starting data seed...');

    const dataSource = app.get(DataSource);

    // Ensure database is connected
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    // ----------------------------------------------------
    // TODO: Write your custom seeding logic here!
    // const usersService = app.get(UsersService);
    // Example:
    // await usersService.register({
    //   email: 'test@example.com',
    //   password: 'Password123!',
    //   name: 'Test Setup User'
    // });
    // logger.log('Test User created!');
    // ----------------------------------------------------

    logger.log('Seeding completed successfully!');
  } catch (error) {
    logger.error('Seeding failed!', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void bootstrap();
