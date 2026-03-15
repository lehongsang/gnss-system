import { Role } from '@/commons/enums/app.enum';
import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    public usersRepository: Repository<User>,
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.syncAdmin();
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
      throw new ForbiddenException();
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
}
