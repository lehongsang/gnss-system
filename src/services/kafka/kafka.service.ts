import { LoggerService } from '@/commons/logger/logger.service';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Kafka,
  Producer,
  Consumer,
  EachMessageHandler,
  EachBatchHandler,
  logLevel,
  Message,
} from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new LoggerService(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Consumer[] = [];
  private isProducerReady = false;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('KAFKA_HOST', 'localhost');
    const port = this.configService.get<string>('KAFKA_PORT', '9092');
    const brokers = [`${host}:${port}`];
    const clientId = this.configService.get<string>(
      'KAFKA_CLIENT_ID',
      'gnss-system',
    );

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.ERROR,
      connectionTimeout: 10000,
      requestTimeout: 60000,
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  async onModuleInit() {
    try {
      await this.producer?.connect();
      this.isProducerReady = true;
      this.logger.log('Kafka Producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka Producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
    }
    for (const consumer of this.consumers) {
      try {
        await consumer.stop();
        await consumer.disconnect();
      } catch (err) {
        // Không throw ở đây để lỗi của 1 consumer không chặn việc đóng các consumer còn lại
        this.logger.error('Error during consumer shutdown', err);
      }
    }
    this.logger.log('All Kafka connections closed');
  }

  /**
   * Gửi message tới một Kafka topic
   * Hỗ trợ cả payload thô lẫn object Message chuẩn của KafkaJS (key, headers, ...)
   */
  async produce(
    topic: string,
    messages: (Record<string, unknown> | Message)[],
  ) {
    // Chặn produce khi chưa connect xong, tránh lỗi khó hiểu từ kafkajs
    if (!this.isProducerReady || !this.producer) {
      throw new Error('Kafka producer is not ready');
    }
    try {
      await this.producer.send({
        topic,
        acks: -1,
        messages: messages.map((m) => {
          if (m && typeof m === 'object' && 'value' in m) {
            // Đã là Message object của KafkaJS, chỉ cần đảm bảo value là string/Buffer
            const message = m as Message;
            return {
              ...message,
              value:
                typeof message.value === 'string' ||
                Buffer.isBuffer(message.value)
                  ? message.value
                  : JSON.stringify(message.value),
            };
          }
          // Payload thô (object thường hoặc string) thì serialize thành string trước khi gửi
          return {
            value: typeof m === 'string' ? m : JSON.stringify(m),
          };
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to produce message to topic ${topic}`, error);
      throw error;
    }
  }

  /**
   * Tạo consumer mới và subscribe vào một topic
   */
  async consume(topic: string, groupId: string, onMessage: EachMessageHandler) {
    const consumer = this.kafka.consumer({
      groupId,
      // Retry khi mất kết nối tạm thời với broker, tối đa 10 lần
      retry: { initialRetryTime: 100, retries: 10 },
      sessionTimeout: 15000,
      heartbeatInterval: 3000,
      rebalanceTimeout: 30000,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: onMessage,
    });
    this.consumers.push(consumer);
    return consumer;
  }

  /**
   * Tạo consumer xử lý theo batch và subscribe vào một topic
   */
  async consumeBatch(
    topic: string,
    groupId: string,
    onBatch: EachBatchHandler,
  ) {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 15000,
      heartbeatInterval: 3000,
      rebalanceTimeout: 30000,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachBatch: onBatch,
    });
    this.consumers.push(consumer);
    return consumer;
  }
}
