import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import { RequestMeta, RequestUser } from '../common/types';
import { DocumentsService } from './documents.service';
import { PatchDocumentDto } from './dto/patch-document.dto';
import { ReplaceFileDto } from './dto/replace-file.dto';
import { AnnotationsDto } from './dto/annotations.dto';
import { UploadsService } from '../uploads/uploads.service';
import { Request, Response } from 'express';
import { DocumentRefDto } from './dto/document-ref.dto';
import { DocumentListResponseDto } from './dto/document-list-response.dto';
import { AnnotationsResponseDto } from './dto/annotations-response.dto';
import { PreviewUrlResponseDto } from '../uploads/dto/preview-url-response.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly uploads: UploadsService
  ) {}

  @Get()
  @ApiOkResponse({ description: 'List documents', type: DocumentListResponseDto })
  async listDocuments(
    @CurrentUser() user: RequestUser,
    @Query('ownerId') ownerId?: string,
    @Query('linkType') linkType?: 'CLAIM' | 'PROFILE' | 'DEPENDENT' | 'PLAN_YEAR',
    @Query('linkId') linkId?: string,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this.documents.listDocuments(
      {
        ownerId,
        linkType,
        linkId,
        category,
        q,
        cursor,
        limit: limit ? Number(limit) : undefined
      },
      user
    );
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get document', type: DocumentRefDto })
  async getDocument(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response
  ) {
    const document = await this.documents.getDocument(id, user);
    res.setHeader('ETag', this.documents.buildEtag(new Date(document.updatedAt)));
    return document;
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update document metadata', type: DocumentRefDto })
  async patchDocument(
    @Param('id') id: string,
    @Body() payload: PatchDocumentDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: Response
  ) {
    const document = await this.documents.updateDocument(id, payload, user, this.buildMeta(req), ifMatch);
    if (res) {
      res.setHeader('ETag', this.documents.buildEtag(new Date(document.updatedAt)));
    }
    return document;
  }

  @Post(':id/replace')
  @ApiOkResponse({ description: 'Start file replacement' })
  async replaceFile(
    @Param('id') id: string,
    @Body() payload: ReplaceFileDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.uploads.initReplacement(id, payload, user, this.buildMeta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteDocument(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    await this.documents.softDelete(id, user, this.buildMeta(req));
    return;
  }

  @Post(':id/restore')
  @ApiOkResponse({ description: 'Restore document', type: DocumentRefDto })
  async restoreDocument(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.documents.restore(id, user, this.buildMeta(req));
  }

  @Post(':id/signed')
  @ApiOkResponse({ description: 'Mark document as signed', type: DocumentRefDto })
  async markSigned(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.documents.markSigned(id, user, this.buildMeta(req));
  }

  @Post(':id/annotations')
  @ApiOkResponse({ description: 'Store annotations', type: AnnotationsResponseDto })
  async setAnnotations(
    @Param('id') id: string,
    @Body() payload: AnnotationsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.documents.setAnnotations(id, payload.annotations, user, this.buildMeta(req));
  }

  @Get(':id/preview-url')
  @ApiOkResponse({ description: 'Get short-lived preview URL', type: PreviewUrlResponseDto })
  async previewUrl(
    @Param('id') id: string,
    @Query('watermark') watermark: 'on' | 'off' | undefined,
    @CurrentUser() user: RequestUser,
    @Req() req: Request
  ) {
    return this.uploads.getPreviewUrl(id, watermark ?? 'off', user, this.buildMeta(req));
  }

  private buildMeta(req: Request): RequestMeta {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
