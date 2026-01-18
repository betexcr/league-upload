import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ClaimsModule } from './claims/claims.module';
import { ClaimsLinkModule } from './claims-link/claims-link.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { ScanModule } from './scan/scan.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';
import { ProxyModule } from './proxy/proxy.module';
import { AdminModule } from './admin/admin.module';
import { PrismaModule } from './common/prisma.module';
import { PresignModule } from './presign/presign.module';
import { UserThrottlerGuard } from './common/user-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60),
          limit: Number(process.env.RATE_LIMIT_MAX ?? 100)
        }
      ]
    }),
    PrismaModule,
    AuthModule,
    StorageModule,
    UploadsModule,
    DocumentsModule,
    ClaimsModule,
    ClaimsLinkModule,
    ScanModule,
    ProxyModule,
    AdminModule,
    PresignModule
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard
    }
  ]
})
export class AppModule {}
