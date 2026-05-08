import {
  Controller,
  UploadedFile,
  Post,
  HttpCode,
  HttpStatus,
  Body,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AllowAnonymous, Roles, Session } from '@thallesp/nestjs-better-auth';
import { User } from '../auth/entities/user.entity';
import { ApiTags } from '@nestjs/swagger';
import { ALL_ROLES } from '@/commons/enums/app.enum';
import { Doc } from '@/commons/docs/doc.decorator';
import { ApiFile } from '@/commons/decorators/file-upload.decorator';
import { FileFieldsValidationPipe } from '@/commons/pipes/file-validation.pipe';
import {
  UserRegisterDto,
  UserResendOtpDto,
  UserVerifyOtpDto,
} from './dtos/create-user.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { DefaultMessageResponseDto } from '@/commons/dtos/default-message-response.dto';
import { RateLimit } from '@/commons/decorators/rate-limit.decorator';
import { ErrorCode } from '@/commons/exceptions';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @Roles(ALL_ROLES)
  @ApiFile('avatar')
  @Doc({
    summary: 'Role: All - Update current user profile',
    description:
      'Update the profile information of the currently logged in user. ' +
      'Supports updating text fields along with an optional avatar upload.',
    request: {
      bodyType: 'FORM_DATA',
    },
    response: {
      serialization: User,
    },
    errors: [
      {
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
        errorCode: ErrorCode.USER_NOT_FOUND,
      },
    ],
  })
  async updateMe(
    @Session() { user }: { user: User },
    @Body() dto: UpdateProfileDto,
    @UploadedFile(
      new FileFieldsValidationPipe({
        avatar: { maxSize: 5 * 1024 * 1024, required: false },
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.usersService.updateProfile(user.id, dto, file);
  }

  @AllowAnonymous()
  @RateLimit({ limit: 3, ttl: 10, key: 'register' })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Role: None - Register a new user',
    description:
      'Create a pending user registration. User data is stored in Redis until email verification is completed.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    errors: [
      {
        status: HttpStatus.CONFLICT,
        message: 'Email already exists',
        errorCode: ErrorCode.EMAIL_ALREADY_EXISTS,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        message: 'Pending registration exists',
        errorCode: ErrorCode.PENDING_REGISTRATION_EXISTS,
      },
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to send OTP',
        errorCode: ErrorCode.FAILED_TO_SEND_OTP,
      },
    ],
  })
  async register(
    @Body() dto: UserRegisterDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.usersService.register(dto);
  }

  @AllowAnonymous()
  @RateLimit({ limit: 5, ttl: 60, key: 'verify-otp' })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Role: None - Verify OTP and complete registration',
    description:
      'Verify the OTP sent to email and create the user account in database.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    errors: [
      {
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid OTP',
        errorCode: ErrorCode.INVALID_OTP,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        message: 'OTP has expired',
        errorCode: ErrorCode.EXPIRED_OTP,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        message: 'Too many OTP attempts',
        errorCode: ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        message: 'Registration session expired',
        errorCode: ErrorCode.REGISTRATION_SESSION_EXPIRED,
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to complete registration',
        errorCode: ErrorCode.REGISTRATION_FAILED,
      },
    ],
  })
  async verifyOtp(
    @Body() dto: UserVerifyOtpDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.usersService.verifyRegistration(dto);
  }

  @AllowAnonymous()
  @RateLimit({ limit: 3, ttl: 10, key: 'resend-otp' })
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: 'Role: None - Resend OTP for pending registration',
    description:
      'Resend the verification OTP to the email for pending registration.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
    errors: [
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        errorCode: ErrorCode.TOO_MANY_REQUESTS,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        message: 'Registration session has expired',
        errorCode: ErrorCode.REGISTRATION_SESSION_EXPIRED,
      },
    ],
  })
  async resendOtp(
    @Body() dto: UserResendOtpDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.usersService.resendRegistrationOtp(dto);
  }
}
