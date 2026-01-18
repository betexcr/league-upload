import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { SqsService } from './sqs.service';
import { LocalStorageController } from './local-storage.controller';

@Module({
  controllers: [LocalStorageController],
  providers: [S3Service, SqsService],
  exports: [S3Service, SqsService]
})
export class StorageModule {}
