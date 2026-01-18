import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ScanWorkerModule } from './scan/scan-worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(ScanWorkerModule);
}

bootstrap();
