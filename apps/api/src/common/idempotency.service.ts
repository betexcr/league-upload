import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma, IdempotencyKey } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async findExisting(key: string, userId: string, route: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: { key_userId_route: { key, userId, route } }
    });
  }

  async enforceMatch(
    existing: IdempotencyKey,
    requestHash: string
  ) {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException('Idempotency key reuse with different payload');
    }
  }

  async store(
    key: string,
    userId: string,
    route: string,
    requestHash: string,
    response: Prisma.InputJsonValue,
    statusCode: number
  ) {
    return this.prisma.idempotencyKey.create({
      data: {
        key,
        userId,
        route,
        requestHash,
        response,
        statusCode
      }
    });
  }
}