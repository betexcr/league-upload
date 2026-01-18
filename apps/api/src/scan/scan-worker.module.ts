import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScanWorkerService } from './scan-worker.service';
import { StorageModule } from '../storage/storage.module';
import { ScanModule } from './scan.module';

@Module({
  imports: [ScheduleModule.forRoot(), StorageModule, ScanModule],
  providers: [ScanWorkerService]
})
export class ScanWorkerModule {}