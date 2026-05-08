import { Role, UserStatus } from '@/commons/enums/app.enum';
import {
  UserRegisterDto,
  UserResendOtpDto,
  UserVerifyOtpDto,
} from './dtos/create-user.dto';
import { DefaultMessageResponseDto } from '@/commons/dtos/default-message-response.dto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '@/services/storage/storage.service';
import { StoragePath } from '@/services/storage/storage.enums';
import { LoggerService } from '@/commons/logger/logger.service';
import { RedisService } from '@/services/redis/redis.service';
import { MailService } from '@/services/mail/mail.service';
import {
  BadRequest,
  Forbidden,
  Conflict,
  TooManyRequestsException,
  InternalError,
  NotFound,
} from '@/commons/exceptions/business.exceptions';
import { ErrorCode } from '@/commons/exceptions/error-codes';
import {
  getRegistrationUserKey,
  getOtpAttemptsKey,
  getRegistrationRateLimitKey,
} from '@/utils/key-redis';
import { generate6DigitOtp } from '@/utils/otp.util';

interface PendingUserData {
  email: string;
  password: string;
  name: string;
  otp: string;
  createdAt: number;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new LoggerService(UsersService.name);
  private readonly OTP_EXPIRY_SECONDS = 120; // 2 minutes
  private readonly PENDING_USER_EXPIRY_SECONDS = 130; // 2 minutes

  constructor(
    @InjectRepository(User)
    public usersRepository: Repository<User>,
    private authService: AuthService,
    private configService: ConfigService,
    private storageService: StorageService,
    private redisService: RedisService,
    private mailService: MailService,
  ) {}

  // Sync admin user on module initialization
  async onModuleInit() {
    await this.syncAdmin();
  }

  /**
   * Gets a user profile by ID.
   * @param userId The ID of the user.
   * @returns The user object.
   */
  async getProfile(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['media', 'merchant', 'clinic'],
    });
    if (!user) {
      throw new NotFound('User not found', ErrorCode.USER_NOT_FOUND);
    }

    // Sign the media URL if it exists
    if (user.media) {
      user.media.url =
        (await this.storageService.getPresignedUrl(user.media.s3Key)) ||
        user.media.url;
    }

    return user;
  }

  /**
   * Updates a user profile.
   * @param userId The ID of the user.
   * @param dto The update profile DTO.
   * @param file Optional avatar file to upload.
   * @returns The updated user object.
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.getProfile(userId);
    const oldMediaId = user.mediaId;

    // 1. Handle file upload if present
    if (file) {
      const media = await this.storageService.uploadFile(
        file,
        true,
        StoragePath.USERS_AVATAR,
      );

      user.mediaId = media.id;
      user.media = media;
      user.image = ''; // Reset direct image field to favor media relation
    }

    // 2. Handle text fields
    Object.assign(user, dto);
    const savedUser = await this.usersRepository.save(user);

    // 3. Delete old media AFTER user has been saved with new mediaId
    if (file && oldMediaId) {
      void this.storageService.deleteFile(oldMediaId);
    }

    // Ensure we return the profile with a signed URL
    return this.getProfile(savedUser.id);
  }

  /**
   * Synchronizes the admin user from environment variables.
   */
  private async syncAdmin() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) {
      this.logger.warn(
        'ADMIN_EMAIL or ADMIN_PASSWORD not set in environment variables. Skipping admin sync.',
      );
      return;
    }

    try {
      const adminExists = await this.usersRepository.findOne({
        where: { email: adminEmail },
      });

      if (!adminExists) {
        this.logger.log(`Admin account ${adminEmail} not found. Creating...`);

        const result = await this.authService.api.signUpEmail({
          body: {
            name: 'System Admin',
            email: adminEmail,
            password: adminPassword,
          },
        });

        await this.usersRepository.update(result.user.id, {
          role: Role.ADMIN,
          emailVerified: true,
        });

        this.logger.log(`Admin account ${adminEmail} created successfully.`);
      } else if (adminExists.role !== Role.ADMIN) {
        this.logger.log(`Updating role to ADMIN for user ${adminEmail}.`);
        await this.usersRepository.update(adminExists.id, {
          role: Role.ADMIN,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sync admin account: ${errorMessage}`);
    }
  }

  /**
   * Creates the first admin user in the system.
   * @param email The email address to use for the admin user.
   * @param password The password to use for the admin user.
   * @returns The newly created user object.
   */
  public async createFirstAdmin(email: string, password: string) {
    if (
      (await this.usersRepository.count({
        where: { role: Role.ADMIN },
      })) > 0
    ) {
      throw new Forbidden(
        'Admin account already exists',
        ErrorCode.ADMIN_ALREADY_EXISTS,
      );
    }

    const result = await this.authService.api.signUpEmail({
      body: {
        name: 'Admin',
        email,
        password,
      },
    });

    await this.usersRepository.update(result.user.id, {
      role: Role.ADMIN,
      emailVerified: true,
    });

    return this.authService.api.signInEmail({
      body: {
        email,
        password,
      },
    });
  }

  /**
   * Registers a new user.
   */
  async register(dto: UserRegisterDto): Promise<DefaultMessageResponseDto> {
    const { email: rawEmail, password, name } = dto;
    const email = rawEmail.trim().toLowerCase();

    const existingUser = await this.usersRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new Conflict(
        'Email already registered. Please login or reset password.',
        ErrorCode.EMAIL_ALREADY_EXISTS,
      );
    }

    const hasPending = await this.hasPendingRegistration(email);
    if (hasPending) {
      throw new BadRequest(
        'Pending registration exists. Please check your email for OTP or request a new one.',
        ErrorCode.PENDING_REGISTRATION_EXISTS,
      );
    }

    // Rate limit check
    const isRateLimited = await this.isRegistrationRateLimited(email);
    if (isRateLimited) {
      throw new TooManyRequestsException(
        `Too many registration requests. Please try again in ${this.OTP_EXPIRY_SECONDS / 60} minutes.`,
      );
    }

    const sent = await this.createPendingUser(email, password, name);

    if (!sent) {
      throw new InternalError(
        'Failed to send verification OTP. Please try again.',
        ErrorCode.FAILED_TO_SEND_OTP,
      );
    }

    return {
      message:
        'Registration initiated. Please check your email for verification OTP.',
    };
  }

  /**
   * Verifies the OTP and completes the user registration.
   */
  async verifyRegistration(
    dto: UserVerifyOtpDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email: rawEmail, otp } = dto;
    const email = rawEmail.trim().toLowerCase();

    const result = await this.verifyOtp(email, otp);

    if (!result.success || !result.data) {
      throw new BadRequest(
        result.error || 'Verification failed',
        result.errorCode || ErrorCode.VERIFICATION_FAILED,
      );
    }

    try {
      const registerResult = await this.authService.api.signUpEmail({
        body: {
          name: result.data.name,
          email: result.data.email,
          password: result.data.password,
        },
      });

      if (registerResult.user) {
        await this.usersRepository.update(registerResult.user.id, {
          name: result.data.name,
          emailVerified: true,
          status: UserStatus.ACTIVE,
          role: Role.USER,
        });
      }

      await this.deletePendingUser(email);

      return {
        message:
          'Registration completed successfully. You can now login with your credentials.',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to complete registration for ${email}: ${errorMessage}`,
      );

      throw new InternalError(
        'Failed to complete registration. Please try again.',
        ErrorCode.REGISTRATION_FAILED,
      );
    }
  }

  /**
   * Resends the OTP for pending registration.
   */
  async resendRegistrationOtp(
    dto: UserResendOtpDto,
  ): Promise<DefaultMessageResponseDto> {
    const { email: rawEmail } = dto;
    const email = rawEmail.trim().toLowerCase();

    // Rate limit check
    const isRateLimited = await this.isRegistrationRateLimited(email);
    if (isRateLimited) {
      throw new TooManyRequestsException(
        `Too many requests. Please try again in ${this.OTP_EXPIRY_SECONDS / 60} minutes.`,
      );
    }

    const sent = await this.resendOtp(email);

    if (!sent) {
      throw new BadRequest(
        'No pending registration found or failed to resend OTP. Please register again.',
        ErrorCode.REGISTRATION_SESSION_EXPIRED,
      );
    }

    return {
      message: 'Verification OTP resent successfully. Please check your email.',
    };
  }

  /**
   * Creates a pending user in Redis with OTP for email verification.
   */
  async createPendingUser(
    email: string,
    password: string,
    name: string,
  ): Promise<boolean> {
    const otp = generate6DigitOtp();
    const pendingUserData: PendingUserData = {
      email,
      password,
      name,
      otp,
      createdAt: Date.now(),
    };

    const key = getRegistrationUserKey(email);

    try {
      await this.redisService.setex(
        key,
        this.PENDING_USER_EXPIRY_SECONDS,
        JSON.stringify(pendingUserData),
      );

      await this.redisService.setex(
        getOtpAttemptsKey(email),
        this.OTP_EXPIRY_SECONDS,
        '0',
      );

      const sent = await this.mailService.sendOtp(
        email,
        otp,
        this.OTP_EXPIRY_SECONDS / 60,
      );

      return sent;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create pending user ${email}: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * Verifies the OTP for a given email.
   */
  async verifyOtp(
    email: string,
    otp: string,
  ): Promise<{
    success: boolean;
    data?: PendingUserData;
    error?: string;
    errorCode?: ErrorCode;
  }> {
    const key = getRegistrationUserKey(email);

    try {
      const pendingUserDataStr = await this.redisService.get(key);

      if (!pendingUserDataStr) {
        return {
          success: false,
          error: 'Registration session expired. Please register again.',
          errorCode: ErrorCode.REGISTRATION_SESSION_EXPIRED,
        };
      }

      const pendingUserData = JSON.parse(pendingUserDataStr) as PendingUserData;

      // Enforce OTP expiry (2 minutes)
      const now = Date.now();
      const otpAgeMs = now - pendingUserData.createdAt;
      if (otpAgeMs > this.OTP_EXPIRY_SECONDS * 1000) {
        // OTP has expired: clean up pending registration and attempts
        await this.redisService.del(key);
        await this.redisService.del(getOtpAttemptsKey(email));
        return {
          success: false,
          error: 'OTP has expired. Please request a new one.',
          errorCode: ErrorCode.EXPIRED_OTP,
        };
      }

      if (pendingUserData.otp !== otp) {
        const attemptsKey = getOtpAttemptsKey(email);
        const attempts = await this.redisService.get(attemptsKey);
        const attemptCount = attempts ? parseInt(attempts, 10) + 1 : 1;

        await this.redisService.setex(
          attemptsKey,
          this.OTP_EXPIRY_SECONDS,
          attemptCount.toString(),
        );

        if (attemptCount >= 5) {
          await this.redisService.del(key);
          return {
            success: false,
            error: 'Too many failed attempts. Please register again.',
            errorCode: ErrorCode.OTP_ATTEMPTS_EXCEEDED,
          };
        }

        return {
          success: false,
          error: `Invalid OTP. ${5 - attemptCount} attempts remaining.`,
          errorCode: ErrorCode.INVALID_OTP,
        };
      }

      await this.redisService.del(getOtpAttemptsKey(email));

      return { success: true, data: pendingUserData };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to verify OTP for ${email}: ${errorMessage}`);
      return {
        success: false,
        error: 'Verification failed. Please try again.',
        errorCode: ErrorCode.VERIFICATION_FAILED,
      };
    }
  }

  /**
   * Resends the OTP for a pending registration.
   */
  async resendOtp(email: string): Promise<boolean> {
    const key = getRegistrationUserKey(email);

    try {
      const pendingUserDataStr = await this.redisService.get(key);

      if (!pendingUserDataStr) {
        this.logger.warn(
          `Cannot resend OTP: No pending registration found for ${email}`,
        );
        return false;
      }

      const pendingUserData = JSON.parse(pendingUserDataStr) as PendingUserData;
      const newOtp = generate6DigitOtp();

      const sent = await this.mailService.sendOtp(
        email,
        newOtp,
        this.OTP_EXPIRY_SECONDS / 60,
      );

      if (sent) {
        pendingUserData.otp = newOtp;
        pendingUserData.createdAt = Date.now();

        await this.redisService.setex(
          key,
          this.PENDING_USER_EXPIRY_SECONDS,
          JSON.stringify(pendingUserData),
        );

        await this.redisService.setex(
          getOtpAttemptsKey(email),
          this.OTP_EXPIRY_SECONDS,
          '0',
        );

        this.logger.log(`OTP sent to: ${email}`);
      } else {
        this.logger.error(`Failed to resend OTP to: ${email}`);
      }

      return sent;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to resend OTP to ${email}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Gets pending user data from Redis.
   */
  async getPendingUser(email: string): Promise<PendingUserData | null> {
    const key = getRegistrationUserKey(email);

    try {
      const pendingUserDataStr = await this.redisService.get(key);

      if (!pendingUserDataStr) {
        return null;
      }

      return JSON.parse(pendingUserDataStr) as PendingUserData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get pending user ${email}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Deletes pending user data from Redis.
   */
  async deletePendingUser(email: string): Promise<void> {
    const key = getRegistrationUserKey(email);
    const attemptsKey = getOtpAttemptsKey(email);

    try {
      await Promise.all([
        this.redisService.del(key),
        this.redisService.del(attemptsKey),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to delete pending user ${email}: ${errorMessage}`,
      );
    }
  }

  /**
   * Checks if there's a pending registration for the given email.
   */
  async hasPendingRegistration(email: string): Promise<boolean> {
    const key = getRegistrationUserKey(email);
    const data = await this.redisService.get(key);
    return data !== null;
  }

  /**
   * Checks if the email is rate limited for registration.
   */
  private async isRegistrationRateLimited(email: string): Promise<boolean> {
    const key = getRegistrationRateLimitKey(email);
    const count = await this.redisService.incr(key);

    if (count === 1) {
      await this.redisService.expire(key, this.OTP_EXPIRY_SECONDS);
    }

    if (count > 5) {
      return true;
    }

    return false;
  }

  /**
   * update kyc status
   */
  async updateKycStatus(userId: string, isVerified: boolean) {
    return await this.usersRepository.update(userId, {
      isVerifiedKyc: isVerified,
    });
  }
}
