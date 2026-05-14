import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Supported file extensions for media upload via presigned URL.
 */
export enum MediaFileExtension {
  JPG = 'jpg',
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  MP4 = 'mp4',
  AVI = 'avi',
  MKV = 'mkv',
}

/**
 * Mapping from file extension to MIME type.
 */
export const EXTENSION_MIME_MAP: Record<MediaFileExtension, string> = {
  [MediaFileExtension.JPG]: 'image/jpeg',
  [MediaFileExtension.JPEG]: 'image/jpeg',
  [MediaFileExtension.PNG]: 'image/png',
  [MediaFileExtension.WEBP]: 'image/webp',
  [MediaFileExtension.MP4]: 'video/mp4',
  [MediaFileExtension.AVI]: 'video/x-msvideo',
  [MediaFileExtension.MKV]: 'video/x-matroska',
};

/**
 * DTO for requesting a presigned upload URL.
 * The IoT device calls this endpoint to obtain a time-limited URL
 * that allows it to upload media directly to S3 via HTTP PUT,
 * bypassing the MQTT/Kafka Base64 pipeline entirely.
 */
export class RequestUploadUrlDto {
  @ApiProperty({ description: 'UUID of the device requesting upload' })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ApiProperty({
    description: 'File extension of the media to be uploaded',
    enum: MediaFileExtension,
    example: MediaFileExtension.JPG,
  })
  @IsNotEmpty()
  @IsEnum(MediaFileExtension)
  fileExtension: MediaFileExtension;

  @ApiPropertyOptional({
    description: 'Optional custom filename (without extension). Defaults to auto-generated timestamp-based name.',
    example: 'front-camera-snapshot',
  })
  @IsOptional()
  @IsString()
  filename?: string;
}
