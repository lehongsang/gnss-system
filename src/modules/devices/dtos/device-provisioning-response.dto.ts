import { ApiProperty } from '@nestjs/swagger';
import { Device } from '../entities/device.entity';

export class DeviceMqttCredentialsDto {
  @ApiProperty({ example: '0198abcd-0000-7000-8000-000000000000' })
  deviceId: string;

  @ApiProperty({ example: 'device:0198abcd-0000-7000-8000-000000000000' })
  mqttUsername: string;

  @ApiProperty({ example: 'generated-once-random-secret' })
  mqttPassword: string;

  @ApiProperty({ example: 'localhost' })
  mqttHost: string;

  @ApiProperty({ example: 1883 })
  mqttPort: number;

  @ApiProperty({ example: 'mqtt' })
  mqttProtocol: string;

  @ApiProperty({
    example: {
      coordinates: 'gnss/0198abcd-0000-7000-8000-000000000000/coordinates',
      status: 'gnss/0198abcd-0000-7000-8000-000000000000/status',
      alert: 'gnss/0198abcd-0000-7000-8000-000000000000/alert',
      image: 'gnss/0198abcd-0000-7000-8000-000000000000/image',
      video: 'gnss/0198abcd-0000-7000-8000-000000000000/video',
      streamStatus: 'gnss/0198abcd-0000-7000-8000-000000000000/stream/status',
      commands: 'gnss/0198abcd-0000-7000-8000-000000000000/command/#',
    },
  })
  topics: Record<string, string>;
}

export class DeviceProvisioningResponseDto {
  @ApiProperty({ type: Device })
  device: Device;

  @ApiProperty({ type: DeviceMqttCredentialsDto })
  mqttCredentials: DeviceMqttCredentialsDto;
}
