import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const userId = (req as any).user?.id;
      const log = {
        level: 'info',
        msg: 'request',
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        correlationId: req.header('x-correlation-id') ?? undefined,
        userId: userId ?? undefined
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(log));
    });
    next();
  }
}
