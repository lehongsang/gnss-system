import { Controller, Get, Post, Delete, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageFileQueryDto } from './dtos/query-file.dto';
import { Session, Roles } from '@thallesp/nestjs-better-auth';
import { User } from '@/modules/auth/entities/user.entity';
import { Role, ALL_ROLES } from '@/commons/enums/app.enum';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Doc } from '@/commons/docs/doc.decorator';

@ApiTags('Storage')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('quota')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Get storage quota and usage' })
  async getQuota(@Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.storageService.getQuota(user.id, isAdmin);
  }

  @Get('files')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Get paginated list of files' })
  async getFiles(@Query() query: StorageFileQueryDto, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.storageService.getFiles(query, user.id, isAdmin);
  }

  @Post('files/upload')
  @Roles(ALL_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Doc({ summary: 'Upload a generic file' })
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Session() { user }: { user: User }) {
    if (!file) throw new BadRequestException('File is required');
    return this.storageService.uploadGenericFile(file, user.id);
  }

  @Get('files/:id/download')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Get a presigned download URL for a file' })
  async getDownloadUrl(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.storageService.getDownloadUrl(id, user.id, isAdmin);
  }

  @Delete('files/:id')
  @Roles(ALL_ROLES)
  @Doc({ summary: 'Delete a file' })
  async deleteFile(@Param('id') id: string, @Session() { user }: { user: User }) {
    const isAdmin = user.role === Role.ADMIN;
    return this.storageService.deleteGenericFile(id, user.id, isAdmin);
  }
}
