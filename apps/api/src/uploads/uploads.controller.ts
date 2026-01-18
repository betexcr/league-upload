import { Body, Controller, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import { RequestMeta, RequestUser } from '../common/types';
import { CreateUploadDto } from './dto/create-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { UploadsService } from './uploads.service';
import { Request, Response } from 'express';
import { InitUploadResponseDto } from './dto/init-upload-response.dto';
import { CompleteUploadResponseDto } from './dto/complete-upload-response.dto';
import { createHash } from 'crypto';
import { IdempotencyService } from '../common/idempotency.service';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly idempotency: IdempotencyService
  ) {}

  @Post()
  @ApiOkResponse({ description: 'Init upload', type: InitUploadResponseDto })
  async initUpload(
    @Body() payload: CreateUploadDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const key = this.getIdempotencyKey(req);
    const route = 'POST /v1/uploads';
    if (key) {
      const requestHash = this.hashPayload(payload);
      const existing = await this.idempotency.findExisting(key, user.id, route);
      if (existing) {
        await this.idempotency.enforceMatch(existing, requestHash);
        res.status(existing.statusCode);
        return existing.response;
      }
      const response = await this.uploads.initUpload(payload, user, this.buildMeta(req));
      await this.idempotency.store(key, user.id, route, requestHash, response, 201);
      return response;
    }
    return this.uploads.initUpload(payload, user, this.buildMeta(req));
  }

  @Post(':uploadId/complete')
  @ApiOkResponse({ description: 'Complete upload', type: CompleteUploadResponseDto })
  async completeUpload(
    @Param('uploadId') uploadId: string,
    @Body() payload: CompleteUploadDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const key = this.getIdempotencyKey(req);
    const route = `POST /v1/uploads/${uploadId}/complete`;
    if (key) {
      const requestHash = this.hashPayload({ uploadId, ...payload });
      const existing = await this.idempotency.findExisting(key, user.id, route);
      if (existing) {
        await this.idempotency.enforceMatch(existing, requestHash);
        res.status(existing.statusCode);
        return existing.response;
      }
      const response = await this.uploads.completeUpload(uploadId, payload, user, this.buildMeta(req));
      await this.idempotency.store(key, user.id, route, requestHash, response, 201);
      return response;
    }
    return this.uploads.completeUpload(uploadId, payload, user, this.buildMeta(req));
  }

  private buildMeta(req: Request): RequestMeta {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private getIdempotencyKey(req: Request) {
    const key = req.headers['idempotency-key'];
    return typeof key === 'string' && key.trim().length > 0 ? key : undefined;
  }

  private hashPayload(payload: unknown) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
