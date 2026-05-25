import { IsOptional, IsString } from 'class-validator';

export class MqttAuthRequestDto {
  @IsOptional()
  @IsString()
  clientid?: string;

  @IsString()
  username: string;

  @IsString()
  password: string;
}

export interface MqttAclRule {
  permission: 'allow' | 'deny';
  action: 'publish' | 'subscribe' | 'all';
  topic: string;
}

export interface MqttAuthResponse {
  result: 'allow' | 'deny' | 'ignore';
  is_superuser: boolean;
  acl?: MqttAclRule[];
}
