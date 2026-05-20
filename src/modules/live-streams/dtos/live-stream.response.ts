import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LiveStreamStatus } from '@/commons/interfaces/live-stream.interface';

export class LiveStreamResponse {
  @ApiProperty()
  requestId: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty({ enum: LiveStreamStatus })
  status: LiveStreamStatus;

  @ApiPropertyOptional()
  webrtcUrl: string | null;

  @ApiProperty()
  startedAt: string;

  @ApiProperty()
  expiresAt: string;

  @ApiPropertyOptional()
  errorMessage?: string;
}
