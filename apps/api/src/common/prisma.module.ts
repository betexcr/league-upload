import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

import { AuditService } from './audit.service';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, IdempotencyService],
  exports: [PrismaService, AuditService, IdempotencyService]
})
export class PrismaModule {}
