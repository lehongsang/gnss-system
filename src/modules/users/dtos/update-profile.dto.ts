import { ApiProperty, PickType, PartialType } from '@nestjs/swagger';
import { User } from '@/modules/auth/entities/user.entity';

export class UpdateProfileDto extends PartialType(
  PickType(User, ['name', 'phoneNumber']),
) {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    required: false,
    description: 'User avatar image file (JPG, PNG, HEIC)',
  })
  avatar?: unknown;
}
