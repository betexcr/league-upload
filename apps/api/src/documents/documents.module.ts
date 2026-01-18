import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { UploadsModule } from '../uploads/uploads.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [UploadsModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService]
})
export class DocumentsModule {}
