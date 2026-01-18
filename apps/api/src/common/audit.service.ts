import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(action: string, actorId: string, targetId?: string, meta?: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({
      data: {
        action,
        actorId,
        targetId,
        meta: meta ?? undefined
      }
    });
  }
}
