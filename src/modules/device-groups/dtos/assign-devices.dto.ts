import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';

export class AssignDevicesDto {
  @ApiProperty({ description: 'Danh sách ID của các thiết bị cần gán/gỡ', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  deviceIds: string[];
}
