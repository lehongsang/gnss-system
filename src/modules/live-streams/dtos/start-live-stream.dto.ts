import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StartLiveStreamDto {
  @ApiPropertyOptional({
    description: 'How long the live stream session should stay active',
    example: 300,
    minimum: 30,
    maximum: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  durationSeconds?: number;
}
