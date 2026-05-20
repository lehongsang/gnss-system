import { Module } from '@nestjs/common';
import { MediaServerService } from './media-server.service';

@Module({
  providers: [MediaServerService],
  exports: [MediaServerService],
})
export class MediaServerModule {}
