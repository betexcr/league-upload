import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw = exception instanceof HttpException
      ? exception.getResponse()
      : { message: 'Internal server error' };

    const parsed = typeof raw === 'string' ? { message: raw } : (raw as any);
    const code = parsed.code ?? HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
    const message = parsed.message ?? 'Internal server error';
    const details = parsed.details ?? (Array.isArray(parsed.message) ? parsed.message : undefined);

    response.status(status).json({
      code,
      message,
      details,
      traceId: request.header('x-correlation-id') ?? undefined
    });
  }
}
