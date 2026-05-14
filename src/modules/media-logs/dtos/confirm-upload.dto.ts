import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Enum for the confirm-upload media type.
 * Matches the two logical media types that IoT devices produce.
 */
export enum ConfirmMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

/**
 * DTO for confirming a successful presigned-URL upload.
 * After the IoT device uploads a file directly to S3 using the
 * presigned URL obtained from `POST /media-logs/request-upload-url`,
 * it calls this endpoint to register the file in the database.
 */
export class ConfirmUploadDto {
  @ApiProperty({ description: 'UUID of the device that performed the upload' })
  @IsNotEmpty()
  @IsUUID('7')
  deviceId: string;

  @ApiProperty({ description: 'S3 object key returned by the request-upload-url endpoint' })
  @IsNotEmpty()
  @IsString()
  s3Key: string;

  @ApiProperty({
    description: 'Type of media that was uploaded',
    enum: ConfirmMediaType,
    example: ConfirmMediaType.IMAGE,
  })
  @IsNotEmpty()
  @IsEnum(ConfirmMediaType)
  mediaType: ConfirmMediaType;
}
