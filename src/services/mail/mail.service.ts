import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendOtp(email: string, otp: string, expiresInMinutes: number = 5) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Your 2FA OTP Code',
        template: './otp', // path to hbs file without extension
        context: {
          subject: 'Verification Code',
          otp,
          expiresIn: expiresInMinutes,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'Nest Base'),
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send OTP to ${email}: ${message}`);
      return false;
    }
  }

  async sendVerificationEmail(email: string, url: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Verify your email address',
        template: './verification',
        context: {
          url,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'Nest Base'),
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send verification email to ${email}: ${message}`,
      );
      return false;
    }
  }

  async sendPasswordReset(email: string, url: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Reset your password',
        template: './password-reset',
        context: {
          url,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'Nest Base'),
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send password reset email to ${email}: ${message}`,
      );
      return false;
    }
  }

  /**
   * Sends a device alert notification email to the device owner.
   * Used by AlertsConsumer to notify users about critical device events
   * such as geofence exits, signal loss, or dangerous obstacles.
   *
   * @param email - Recipient email address (device owner)
   * @param title - Alert title (e.g., "⚠️ Thiết bị thoát khỏi vùng địa lý")
   * @param body - Detailed alert description
   * @returns true if email was sent successfully, false otherwise
   */
  async sendAlertEmail(
    email: string,
    title: string,
    body: string,
  ): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `[GNSS Alert] ${title}`,
        template: './alert',
        context: {
          title,
          body,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'GNSS System'),
        },
      });
      this.logger.log(`Alert email sent to ${email}: ${title}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send alert email to ${email}: ${message}`,
      );
      return false;
    }
  }
}
