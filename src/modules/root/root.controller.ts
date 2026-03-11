import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Doc } from '@/commons/docs/doc.decorator';
import { DefaultMessageResponseDto } from '@/commons/dtos/default-message-response.dto';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateFirstAdminDto, GetMetadataDto } from './dtos/root.dto';
import { RootService } from './root.service';
import { LoggerService } from '@/commons/logger/logger.service';
import { RateLimit } from '@/commons/decorators/rate-limit.decorator';

@ApiTags('Root')
@Controller()
export class RootController {
  private readonly loggerService = new LoggerService(RootController.name);

  constructor(private readonly rootService: RootService) {}

  @AllowAnonymous()
  @Get('health')
  @RateLimit({ limit: 10, ttl: 10000 })
  getHealth(): string {
    this.loggerService.log('Health check');
    this.loggerService.error('Health check');
    this.loggerService.warn('Health check');
    this.loggerService.debug('Health check');
    this.loggerService.verbose('Health check');
    return this.rootService.getHealth();
  }

  @AllowAnonymous()
  @Doc({
    summary: 'Creates the first admin user in the system.',
    description: 'Creates the first admin user in the system.',
    response: {
      serialization: DefaultMessageResponseDto,
    },
  })
  @Post('init-admin')
  createFirstAdmin(
    @Body() dto: CreateFirstAdminDto,
  ): Promise<DefaultMessageResponseDto> {
    return this.rootService.createFirstAdmin(dto);
  }

  @Doc({
    summary: 'Get system metadata.',
    description:
      'Returns metadata about the system state, like whether it has been initialized.',
    response: {
      serialization: GetMetadataDto,
    },
  })
  @Get('metadata')
  getMetadata() {
    return this.rootService.getMetadata();
  }
}
