import { PartialType } from '@nestjs/swagger';
import { CreateDeviceGroupDto } from './create-device-group.dto';

export class UpdateDeviceGroupDto extends PartialType(CreateDeviceGroupDto) {}
