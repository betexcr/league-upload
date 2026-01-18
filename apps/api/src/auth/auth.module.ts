import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [JwtAuthGuard, RolesGuard, AuthService],
  exports: [JwtAuthGuard, RolesGuard]
})
export class AuthModule {}
