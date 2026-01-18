import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user as { id?: string } | undefined;
    const auth = req.headers['authorization'];
    return user?.id ?? (typeof auth === 'string' ? auth : '') ?? req.ip;
  }
}
