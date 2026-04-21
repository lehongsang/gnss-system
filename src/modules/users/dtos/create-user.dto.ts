import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

/**
 * DTO for updating the authenticated user's own profile.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Full display name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Phone number in any format', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Date of birth in ISO 8601 format', example: '1995-06-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}
