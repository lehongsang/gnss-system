import type { KafkaDeadLetterPayload } from '../kafka/kafka.interface';

/**
 * Payload produced to the STORAGE_UPLOAD Kafka topic for async file processing.
 */
export type StorageUploadMessage = {
  /** ID of the Media record (status = PENDING) created before upload */
  mediaId: string;
  /** Presigned GET URL from which the worker fetches the raw file */
  fileUrl: string;
  mimeType: string;
  filename: string;
  folder: string;
};

export type StorageDeadLetterPayload =
  KafkaDeadLetterPayload<StorageUploadMessage>;

