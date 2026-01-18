import { Body, Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminLogDto } from './dto/admin-log.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  @Post('logs')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Log client-side events' })
  async logClientEvent(@Body() payload: AdminLogDto, @Req() req: Request) {
    const meta = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      context: payload.context ?? {}
    };
    const message = `[client:${payload.level}] ${payload.message}`;
    const context = JSON.stringify(meta);
    if (payload.level === 'error') {
      this.logger.error(message, undefined, context);
      return { ok: true };
    }
    if (payload.level === 'warn') {
      this.logger.warn(message, context);
      return { ok: true };
    }
    this.logger.log(message, context);
    return { ok: true };
  }
}
