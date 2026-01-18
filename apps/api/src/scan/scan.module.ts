import { Module } from '@nestjs/common';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { ClamAvService } from './clamav.service';
import { ScanEngineService } from './scan-engine.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ScanController],
  providers: [ScanService, ClamAvService, ScanEngineService],
  exports: [ScanService, ScanEngineService]
})
export class ScanModule {}
