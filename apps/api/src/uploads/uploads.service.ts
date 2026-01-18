import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { RequestMeta, RequestUser } from '../common/types';
import { S3Service } from '../storage/s3.service';
import { SqsService } from '../storage/sqs.service';
import { AuditService } from '../common/audit.service';
import { Role, VersionStatus } from '@prisma/client';
import { ReplaceFileDto } from '../documents/dto/replace-file.dto';

@Injectable()
export class UploadsService {
  private readonly maxFileBytes: number;
  private readonly partSizeBytes = 8 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly sqs: SqsService,
    private readonly audit: AuditService
  ) {
    const maxFileMb = Number(process.env.MAX_FILE_MB ?? 200);
    this.maxFileBytes = maxFileMb * 1024 * 1024;
  }

  async initUpload(payload: CreateUploadDto, user: RequestUser, meta?: RequestMeta) {
    this.validateFilePolicy(payload.sizeBytes, payload.mimeType);

    const objectKey = this.buildObjectKey(user.id, payload.fileName);
    const multipartUploadId = await this.s3.createMultipartUpload(objectKey, payload.mimeType);
    const parts = await this.s3.signParts(objectKey, multipartUploadId, this.getPartCount(payload.sizeBytes));

    const [document, version] = await this.prisma.$transaction(async (tx) => {
      const createdDocument = await tx.document.create({
        data: {
          ownerId: user.id,
          latestVersionId: null,
          title: payload.fileName,
          categories: payload.categories,
          tags: payload.tags,
          notes: payload.notes ?? null,
          docDate: payload.docDate ? new Date(payload.docDate) : null,
          sizeBytes: BigInt(payload.sizeBytes),
          mimeType: payload.mimeType,
          entityLinks: {
            create: payload.entityLinks.map((link) => ({
              type: link.type,
              refId: link.id
            }))
          }
        }
      });

      const createdVersion = await tx.version.create({
        data: {
          documentId: createdDocument.id,
          objectKey,
          status: VersionStatus.PROCESSING,
          multipartUploadId
        }
      });

      return [createdDocument, createdVersion];
    });

    await this.audit.log('upload.init', user.id, document.id, { ...(meta ?? {}), uploadId: version.id });

    return {
      uploadId: version.id,
      engine: 'multipart' as const,
      parts,
      objectKey
    };
  }

  async initReplacement(documentId: string, payload: ReplaceFileDto, user: RequestUser, meta?: RequestMeta) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!this.canEdit(document, user)) {
      throw new ForbiddenException('Access denied');
    }

    if (document.deletedAt) {
      throw new BadRequestException('Cannot replace a deleted document');
    }

    this.validateFilePolicy(payload.sizeBytes, payload.mimeType);

    const objectKey = this.buildObjectKey(user.id, payload.fileName);
    const multipartUploadId = await this.s3.createMultipartUpload(objectKey, payload.mimeType);
    const parts = await this.s3.signParts(objectKey, multipartUploadId, this.getPartCount(payload.sizeBytes));

    const [, version] = await this.prisma.$transaction(async (tx) => {
      const updatedDocument = await tx.document.update({
        where: { id: documentId },
        data: {
          sizeBytes: BigInt(payload.sizeBytes),
          mimeType: payload.mimeType
        }
      });

      const createdVersion = await tx.version.create({
        data: {
          documentId,
          objectKey,
          status: VersionStatus.PROCESSING,
          multipartUploadId
        }
      });

      return [updatedDocument, createdVersion];
    });

    await this.audit.log('document.replace', user.id, documentId, { ...(meta ?? {}), uploadId: version.id });

    return {
      uploadId: version.id,
      engine: 'multipart' as const,
      parts,
      objectKey
    };
  }

  async completeUpload(uploadId: string, payload: CompleteUploadDto, user: RequestUser, meta?: RequestMeta) {
    const version = await this.prisma.version.findUnique({
      where: { id: uploadId },
      include: { document: true }
    });

    if (!version) {
      throw new NotFoundException('Upload not found');
    }

    if (version.status !== VersionStatus.PROCESSING) {
      throw new BadRequestException('Upload already completed');
    }

    if (!this.canEdit(version.document, user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!version.multipartUploadId) {
      throw new BadRequestException('Missing multipart upload id');
    }

    this.validateFilePolicy(payload.sizeBytes, version.document.mimeType);
    const expectedParts = this.getPartCount(payload.sizeBytes);
    this.validateParts(payload.parts, expectedParts);

    const etag = await this.s3.completeMultipartUpload(
      version.objectKey,
      version.multipartUploadId,
      payload.parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag }))
    );

    await this.prisma.version.update({
      where: { id: version.id },
      data: {
        etag,
        sha256: payload.sha256 ?? null,
        status: VersionStatus.PROCESSING,
        multipartUploadId: null
      }
    });

    await this.prisma.document.update({
      where: { id: version.documentId },
      data: {
        sizeBytes: BigInt(payload.sizeBytes),
        mimeType: version.document.mimeType
      }
    });

    await this.sqs.sendScanJob({
      uploadId: version.id,
      documentId: version.documentId,
      versionId: version.id
    });

    await this.audit.log('upload.complete', user.id, version.documentId, { ...(meta ?? {}), uploadId: version.id });

    return {
      documentId: version.documentId,
      versionId: version.id,
      status: 'processing' as const
    };
  }

  async getPreviewUrl(documentId: string, watermark: 'on' | 'off', user: RequestUser, meta?: RequestMeta) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const canView = await this.canView(documentId, document.ownerId, user);
    if (!canView) {
      throw new ForbiddenException('Access denied');
    }

    const version = await this.resolvePreviewVersion(documentId, document.latestVersionId ?? undefined);
    if (!version) {
      throw new BadRequestException('No available version');
    }
    const localPreviewAllowed =
      (process.env.LOCAL_STORAGE === 'true' ||
        (process.env.LOCAL_STORAGE === undefined &&
          (process.env.NODE_ENV ?? 'development') !== 'production')) &&
      (process.env.NODE_ENV ?? 'development') !== 'production';
    if (version.status !== VersionStatus.CLEAN && !localPreviewAllowed) {
      throw new BadRequestException('Preview unavailable until scan is clean');
    }

    const ttlSeconds = Math.min(Number(process.env.PREVIEW_URL_TTL_SECONDS ?? 300), 300);
    // TODO: Implement watermark proxy for agent previews when watermark=on.
    const url = await this.s3.getPresignedGetUrl(version.objectKey, ttlSeconds);

    await this.audit.log('document.preview', user.id, documentId, { ...(meta ?? {}), watermark });

    return {
      url,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    };
  }

  private buildObjectKey(ownerId: string, fileName: string) {
    const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const timestamp = Date.now();
    return `documents/${ownerId}/${timestamp}-${safeName}`;
  }

  private validateFilePolicy(sizeBytes: number, mimeType: string) {
    if (sizeBytes > this.maxFileBytes) {
      throw new BadRequestException('File exceeds maximum size');
    }
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      throw new BadRequestException('Unsupported file type');
    }
  }

  private validateParts(parts: Array<{ partNumber: number; etag: string }>, expectedCount?: number) {
    if (!parts || parts.length === 0) {
      throw new BadRequestException('Missing parts');
    }
    if (expectedCount && parts.length !== expectedCount) {
      throw new BadRequestException('Missing upload parts');
    }
    const partNumbers = new Set<number>();
    for (const part of parts) {
      if (partNumbers.has(part.partNumber)) {
        throw new BadRequestException('Duplicate part numbers');
      }
      partNumbers.add(part.partNumber);
    }
    if (expectedCount) {
      for (let i = 1; i <= expectedCount; i += 1) {
        if (!partNumbers.has(i)) {
          throw new BadRequestException('Missing upload parts');
        }
      }
    }
  }

  private getPartCount(sizeBytes: number) {
    const partCount = Math.ceil(sizeBytes / this.partSizeBytes);
    if (partCount > 10000) {
      throw new BadRequestException('File requires too many parts');
    }
    return partCount;
  }

  private async resolvePreviewVersion(documentId: string, latestVersionId?: string) {
    if (latestVersionId) {
      return this.prisma.version.findUnique({ where: { id: latestVersionId } });
    }
    return this.prisma.version.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async canView(documentId: string, ownerId: string, user: RequestUser) {
    if (user.role === Role.ADMIN) {
      return true;
    }
    if (user.role === Role.MEMBER) {
      return ownerId === user.id;
    }
    const assignments = await this.prisma.claimAssignment.findMany({
      where: { agentId: user.id },
      select: { claimId: true }
    });
    const claimIds = assignments.map((assignment) => assignment.claimId);
    if (claimIds.length === 0) {
      return false;
    }
    const link = await this.prisma.entityLink.findFirst({
      where: { documentId, type: 'CLAIM', refId: { in: claimIds } }
    });
    return Boolean(link);
  }

  private canEdit(document: { ownerId: string }, user: RequestUser) {
    if (user.role === Role.ADMIN) {
      return true;
    }
    return user.role === Role.MEMBER && document.ownerId === user.id;
  }
}
