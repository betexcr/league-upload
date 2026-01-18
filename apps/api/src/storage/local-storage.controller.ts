import { Controller, Get, HttpCode, NotFoundException, Param, Put, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';
import { resolveLocalStoragePath } from './local-storage.util';

@ApiTags('local-storage')
@Controller('local-storage')
export class LocalStorageController {
  private readonly basePath: string;

  constructor() {
    this.basePath = resolveLocalStoragePath(process.env.LOCAL_STORAGE_PATH);
  }

  @Put('multipart/:uploadId/part/:partNumber')
  @HttpCode(200)
  async uploadPart(
    @Param('uploadId') uploadId: string,
    @Param('partNumber') partNumber: string,
    @Req() req: Request
  ) {
    const rawBody = req.body as unknown;
    const buffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
      ? Buffer.from(rawBody)
      : Buffer.from([]);
    if (buffer.length === 0) {
      return { ok: true };
    }

    const dir = path.join(this.basePath, 'multipart', uploadId);
    await fs.mkdir(dir, { recursive: true });
    const partPath = path.join(dir, `part-${partNumber}`);
    await fs.writeFile(partPath, buffer);
    return { ok: true };
  }

  @Get('object')
  async getObject(@Query('key') key: string, @Req() _req: Request, @Res() res: Response) {
    if (!key) {
      throw new NotFoundException('Object not found');
    }
    const safeKey = decodeURIComponent(key);
    const filePath = this.resolvePath(safeKey);

    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Object not found');
    }

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', this.buildFrameAncestorsPolicy());
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', this.detectContentType(filePath));
    res.sendFile(filePath, { etag: false, lastModified: false });
  }

  private resolvePath(objectKey: string) {
    const normalized = objectKey.replace(/\\/g, '/').replace(/\.\./g, '');
    return path.join(this.basePath, normalized);
  }

  private detectContentType(filePath: string) {
    if (filePath.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (filePath.endsWith('.png')) {
      return 'image/png';
    }
    return 'application/octet-stream';
  }

  private buildFrameAncestorsPolicy() {
    const origins = (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
    const devOrigins =
      origins.length === 0 && isDev
        ? ['http://localhost:5173', 'http://127.0.0.1:5173']
        : origins;
    const ancestors = devOrigins.length > 0 ? devOrigins.join(' ') : "'self'";
    return `frame-ancestors 'self' ${ancestors}`;
  }
}
