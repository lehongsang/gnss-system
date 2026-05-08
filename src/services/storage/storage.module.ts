import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { KafkaModule } from '../kafka/kafka.module';
import { StorageService } from './storage.service';
import { StorageConsumer } from './storage.consumer';
import { StorageController } from './storage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Media]), KafkaModule],
  controllers: [StorageController],
  providers: [StorageService, StorageConsumer],
  exports: [StorageService],
})
export class StorageModule {}
