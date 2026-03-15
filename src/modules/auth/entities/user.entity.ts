import { BaseEntity } from '@/commons/entities/base.entity';
import { Role, UserStatus } from '@/commons/enums/app.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany } from 'typeorm';
import { Account } from './account.entity';
import { Session } from './session.entity';

@Entity('user')
export class User extends BaseEntity {
  @ApiProperty({ description: 'Name of the user' })
  @Column({ type: 'varchar', length: 200, nullable: true })
  name?: string;

  @ApiProperty({
    description: 'Phone number of the user',
    example: '0901234567',
  })
  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  phone?: string;

  @ApiProperty({ description: 'Email of the user' })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'boolean' })
  emailVerified: boolean;

  @ApiProperty({ description: 'Full name of the user' })
  @Column({ type: 'varchar', length: 200, nullable: true })
  fullName?: string;

  @Column({ type: 'text', nullable: true })
  image?: string;

  @ApiProperty({ description: 'ID of the avatar media' })
  @Column({ type: 'integer', nullable: true })
  mediaId?: number;

  @ApiProperty({ description: 'CCCD of the user' })
  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  cccd?: string;

  @ApiProperty({ description: 'Date of birth of the user' })
  @Column({ type: 'date', nullable: true })
  dateOfBirth?: Date;

  @ApiProperty({ description: 'Address of the user' })
  @Column({ type: 'text', nullable: true })
  address?: string;

  @ApiProperty({ description: 'Is KYC verified' })
  @Column({ type: 'boolean', nullable: true, default: false })
  isVerifiedKyc?: boolean;

  @ApiProperty({ enum: UserStatus, description: 'Status of the user' })
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty({ enum: Role })
  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ type: 'text', default: 'en' })
  language: string;

  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @OneToMany(() => Account, (account) => account.user)
  accounts: Account[];

  @Column({ type: 'timestamptz', nullable: true })
  banExpires?: Date;

  @Column({ type: 'boolean', nullable: true })
  banned?: boolean;

  @Column({ type: 'text', nullable: true })
  banReason?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  twoFactorEnabled?: boolean;
}
