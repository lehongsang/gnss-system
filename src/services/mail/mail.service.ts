import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import Handlebars from 'handlebars';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { join } from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly templateDir = join(__dirname, 'templates');

  constructor(private readonly configService: ConfigService) {
    const transportOptions: SMTPTransport.Options = {
      host: this.configService.get<string>('MAIL_HOST'),
      port: Number(this.configService.get<string>('MAIL_PORT', '587')),
      secure: this.configService.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    };
    this.transporter = nodemailer.createTransport(transportOptions);
  }

  private async renderTemplate(
    template: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const templateName = template.replace(/^\.\//, '');
    const source = await readFile(
      join(this.templateDir, `${templateName}.hbs`),
      'utf8',
    );
    return Handlebars.compile(source, { strict: true })(context);
  }

  private async sendTemplateMail(options: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    const html = await this.renderTemplate(options.template, options.context);
    await this.transporter.sendMail({
      to: options.to,
      subject: options.subject,
      html,
      from: this.configService.get<string>('MAIL_FROM'),
    });
  }

  async sendOtp(email: string, otp: string, expiresInMinutes: number = 5) {
    try {
      await this.sendTemplateMail({
        to: email,
        subject: 'Your 2FA OTP Code',
        template: './otp', // path to hbs file without extension
        context: {
          subject: 'Verification Code',
          otp,
          expiresIn: expiresInMinutes,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'GNSS System'),
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
      await this.sendTemplateMail({
        to: email,
        subject: 'Verify your email address',
        template: './verification',
        context: {
          url,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'GNSS System'),
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
      await this.sendTemplateMail({
        to: email,
        subject: 'Reset your password',
        template: './password-reset',
        context: {
          url,
          currentYear: new Date().getFullYear(),
          appName: this.configService.get<string>('APP_NAME', 'GNSS System'),
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
   * @param title - Alert title (e.g., "Thiết bị thoát khỏi vùng địa lý")
   * @param body - Detailed alert description
   * @returns true if email was sent successfully, false otherwise
   */
  async sendAlertEmail(
    email: string,
    title: string,
    body: string,
  ): Promise<boolean> {
    try {
      await this.sendTemplateMail({
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
