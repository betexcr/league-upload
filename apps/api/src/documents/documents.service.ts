import { BadRequestException, ForbiddenException, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RequestMeta, RequestUser } from '../common/types';
import { Role, VersionStatus } from '@prisma/client';
import { PatchDocumentDto } from './dto/patch-document.dto';
import { AuditService } from '../common/audit.service';
import { S3Service } from '../storage/s3.service';

export type DocumentRef = {
  id: string;
  latestVersionId: string | null;
  ownerId: string;
  status: 'ACTIVE' | 'SIGNED';
  title: string;
  categories: string[];
  tags: string[];
  notes?: string | null;
  docDate?: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  entityLinks: { type: 'CLAIM' | 'PROFILE' | 'DEPENDENT' | 'PLAN_YEAR'; id: string }[];
  annotations?: any;
  acl: { canView: boolean; canEdit: boolean; canDelete: boolean };
  versionStatus: 'PROCESSING' | 'CLEAN' | 'BLOCKED';
  previewUrl?: string;
};

type DocumentListFilters = {
  ownerId?: string;
  linkType?: 'CLAIM' | 'PROFILE' | 'DEPENDENT' | 'PLAN_YEAR';
  linkId?: string;
  category?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly s3: S3Service
  ) {}

  async listDocuments(filters: DocumentListFilters, user: RequestUser) {
    const baseWhere: any = { deletedAt: null };
    const andConditions: any[] = [];

    if (filters.category) {
      andConditions.push({ categories: { has: filters.category } });
    }

    if (filters.linkType && filters.linkId) {
      andConditions.push({ entityLinks: { some: { type: filters.linkType, refId: filters.linkId } } });
    }

    if (filters.q) {
      andConditions.push({
        OR: [
          { title: { contains: filters.q, mode: 'insensitive' } },
          { tags: { has: filters.q } }
        ]
      });
    }

    const accessScope = await this.applyAccessScope(baseWhere, filters.ownerId, user);
    if (!accessScope) {
      return { items: [], nextCursor: undefined };
    }

    const limit = Math.min(filters.limit ?? 20, 100);
    const cursor = filters.cursor ? this.parseCursor(filters.cursor) : null;

    if (andConditions.length > 0) {
      baseWhere.AND = [...(baseWhere.AND ?? []), ...andConditions];
    }

    const maxLoops = 200;
    let loops = 0;
    let cursorCondition = cursor;
    let lastDoc: { createdAt: Date; id: string } | null = null;
    let hasMore = true;
    const collected: DocumentRef[] = [];

    while (collected.length < limit && hasMore && loops < maxLoops) {
      loops += 1;
      const loopWhere = { ...baseWhere };
      if (cursorCondition) {
        loopWhere.AND = [
          ...(loopWhere.AND ?? []),
          {
            OR: [
              { createdAt: { lt: cursorCondition.createdAt } },
              { createdAt: cursorCondition.createdAt, id: { lt: cursorCondition.id } }
            ]
          }
        ];
      }

      const documents = await this.prisma.document.findMany({
        where: loopWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: {
          entityLinks: true
        }
      });

      if (documents.length === 0) {
        hasMore = false;
        break;
      }

      lastDoc = documents[documents.length - 1];
      cursorCondition = lastDoc;
      hasMore = documents.length === limit;

      const versionStatuses = await this.resolveVersionStatuses(documents);
      const previewUrls = await this.resolvePreviewUrls(documents);

      const mappedItems = documents.map((doc) =>
        this.toDocumentRef(
          doc,
          user,
          versionStatuses.get(doc.id) ?? 'PROCESSING',
          previewUrls.get(doc.id)
        )
      );

      collected.push(
        ...mappedItems.filter(
          (doc) => !(doc.versionStatus === 'PROCESSING' && !doc.previewUrl)
        )
      );
    }

    return {
      items: collected.slice(0, limit),
      nextCursor: hasMore && lastDoc ? this.encodeCursor(lastDoc) : undefined
    };
  }

  async getDocument(id: string, user: RequestUser) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { entityLinks: true }
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const canView = await this.canView(document.id, document.ownerId, user);
    if (!canView) {
      throw new ForbiddenException('Access denied');
    }

    const status = await this.resolveVersionStatus(document.id, document.latestVersionId);
    const previewUrl = await this.resolvePreviewUrl(document.id, document.latestVersionId);
    return this.toDocumentRef(document, user, status, previewUrl ?? undefined);
  }

  async updateDocument(
    id: string,
    payload: PatchDocumentDto,
    user: RequestUser,
    meta?: RequestMeta,
    ifMatch?: string
  ) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!this.canEdit(document, user)) {
      throw new ForbiddenException('Access denied');
    }

    if (ifMatch && ifMatch !== this.buildEtag(document.updatedAt)) {
      throw new PreconditionFailedException('Document has been modified');
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: payload.title ?? undefined,
        categories: payload.categories ?? undefined,
        tags: payload.tags ?? undefined,
        notes: payload.notes ?? undefined,
        docDate: payload.docDate ? new Date(payload.docDate) : undefined
      },
      include: { entityLinks: true }
    });

    await this.audit.log('document.update', user.id, id, meta);
    const status = await this.resolveVersionStatus(updated.id, updated.latestVersionId);
    const previewUrl = await this.resolvePreviewUrl(updated.id, updated.latestVersionId);
    return this.toDocumentRef(updated, user, status, previewUrl ?? undefined);
  }

  async softDelete(id: string, user: RequestUser, meta?: RequestMeta) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (user.role === Role.AGENT) {
      const canView = await this.canView(document.id, document.ownerId, user);
      if (!canView) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (!this.canDelete(document, user)) {
      throw new ForbiddenException('Access denied');
    }

    if (document.legalHold) {
      throw new BadRequestException('Document is under legal hold');
    }

    await this.prisma.document.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user.id
      }
    });

    await this.audit.log('document.delete', user.id, id, meta);
  }

  async restore(id: string, user: RequestUser, meta?: RequestMeta) {
    const document = await this.prisma.document.findUnique({ where: { id }, include: { entityLinks: true } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!this.canEdit(document, user)) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: { entityLinks: true }
    });

    await this.audit.log('document.restore', user.id, id, meta);
    const status = await this.resolveVersionStatus(updated.id, updated.latestVersionId);
    return this.toDocumentRef(updated, user, status);
  }

  async markSigned(id: string, user: RequestUser, meta?: RequestMeta) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { entityLinks: true }
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (user.role !== Role.AGENT && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role === Role.AGENT) {
      const canView = await this.canView(document.id, document.ownerId, user);
      if (!canView) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (document.status === 'SIGNED') {
      const status = await this.resolveVersionStatus(document.id, document.latestVersionId);
      const previewUrl = await this.resolvePreviewUrl(document.id, document.latestVersionId);
      return this.toDocumentRef(document, user, status, previewUrl ?? undefined);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signedById: user.id
      },
      include: { entityLinks: true }
    });

    await this.audit.log('document.signed', user.id, id, meta);
    const status = await this.resolveVersionStatus(updated.id, updated.latestVersionId);
    const previewUrl = await this.resolvePreviewUrl(updated.id, updated.latestVersionId);
    return this.toDocumentRef(updated, user, status, previewUrl ?? undefined);
  }

  async setAnnotations(id: string, annotations: any[], user: RequestUser, meta?: RequestMeta) {
    const document = await this.prisma.document.findUnique({ where: { id }, include: { entityLinks: true } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const canView = await this.canView(document.id, document.ownerId, user);
    if (!canView) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: { annotations },
      include: { entityLinks: true }
    });

    await this.audit.log('document.annotations', user.id, id, meta);
    return { annotations: updated.annotations ?? [] };
  }

  private toDocumentRef(
    document: any,
    user: RequestUser,
    status: 'PROCESSING' | 'CLEAN' | 'BLOCKED',
    previewUrl?: string
  ): DocumentRef {
    const acl = {
      canView: true,
      canEdit: this.canEdit(document, user),
      canDelete: this.canDelete(document, user)
    };

    return {
      id: document.id,
      latestVersionId: document.latestVersionId ?? null,
      ownerId: document.ownerId,
      status: document.status ?? 'ACTIVE',
      title: document.title,
      categories: document.categories,
      tags: document.tags,
      notes: document.notes ?? undefined,
      docDate: document.docDate ? document.docDate.toISOString() : undefined,
      mimeType: document.mimeType,
      sizeBytes: Number(document.sizeBytes),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      deletedAt: document.deletedAt ? document.deletedAt.toISOString() : null,
      entityLinks: document.entityLinks.map((link: any) => ({ type: link.type, id: link.refId })),
      annotations: document.annotations ?? undefined,
      acl,
      versionStatus: status,
      previewUrl
    };
  }

  private async resolvePreviewUrls(
    documents: Array<{ id: string; latestVersionId: string | null; mimeType: string }>
  ) {
    const map = new Map<string, string>();
    const candidates = documents.filter(
      (doc) => doc.mimeType.startsWith('image/') || doc.mimeType.includes('pdf')
    );
    if (!candidates.length) {
      return map;
    }
    await Promise.all(
      candidates.map(async (doc) => {
        const url = await this.resolvePreviewUrl(doc.id, doc.latestVersionId);
        if (url) {
          map.set(doc.id, url);
        }
      })
    );
    return map;
  }

  private async resolvePreviewUrl(documentId: string, latestVersionId?: string | null) {
    const version = latestVersionId
      ? await this.prisma.version.findUnique({
          where: { id: latestVersionId },
          select: { objectKey: true }
        })
      : await this.prisma.version.findFirst({
          where: { documentId },
          orderBy: { createdAt: 'desc' },
          select: { objectKey: true }
        });
    if (!version?.objectKey) {
      return null;
    }
    const ttlSeconds = Math.min(Number(process.env.PREVIEW_URL_TTL_SECONDS ?? 300), 300);
    try {
      return await this.s3.getPresignedGetUrl(version.objectKey, ttlSeconds);
    } catch {
      return null;
    }
  }

  private async applyAccessScope(where: any, ownerId: string | undefined, user: RequestUser) {
    if (user.role === Role.ADMIN) {
      if (ownerId) {
        where.ownerId = ownerId;
      }
      return true;
    }

    if (user.role === Role.MEMBER) {
      where.ownerId = user.id;
      return true;
    }

    if (user.role === Role.AGENT) {
      if (ownerId) {
        where.ownerId = ownerId;
      }
      return true;
    }

    return false;
  }

  private parseCursor(cursor: string) {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const [createdAt, id] = decoded.split('|');
    if (!createdAt || !id) {
      throw new BadRequestException('Invalid cursor');
    }
    return { createdAt: new Date(createdAt), id };
  }

  private encodeCursor(document: { createdAt: Date; id: string }) {
    return Buffer.from(`${document.createdAt.toISOString()}|${document.id}`).toString('base64');
  }

  private async resolveVersionStatuses(documents: any[]) {
    const map = new Map<string, 'PROCESSING' | 'CLEAN' | 'BLOCKED'>();
    const latestIds = documents.map((doc) => doc.latestVersionId).filter((id) => id);
    if (latestIds.length > 0) {
      const latestVersions = await this.prisma.version.findMany({
        where: { id: { in: latestIds as string[] } },
        select: { id: true, status: true, documentId: true }
      });
      for (const version of latestVersions) {
        map.set(version.documentId, version.status);
      }
    }

    const missingDocs = documents.filter((doc) => !map.has(doc.id));
    if (missingDocs.length > 0) {
      const versions = await this.prisma.version.findMany({
        where: { documentId: { in: missingDocs.map((doc) => doc.id) } },
        orderBy: { createdAt: 'desc' },
        select: { documentId: true, status: true }
      });
      for (const version of versions) {
        if (!map.has(version.documentId)) {
          map.set(version.documentId, version.status);
        }
      }
    }

    return map;
  }

  private async resolveVersionStatus(documentId: string, latestVersionId?: string | null) {
    if (latestVersionId) {
      const version = await this.prisma.version.findUnique({
        where: { id: latestVersionId },
        select: { status: true }
      });
      if (version) {
        return version.status;
      }
    }

    const latest = await this.prisma.version.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      select: { status: true }
    });
    return latest?.status ?? VersionStatus.PROCESSING;
  }

  buildEtag(updatedAt: Date) {
    return `W/\"${updatedAt.getTime()}\"`;
  }

  private async canView(documentId: string, ownerId: string, user: RequestUser) {
    if (user.role === Role.ADMIN) {
      return true;
    }
    if (user.role === Role.MEMBER) {
      return ownerId === user.id;
    }
    if (user.role === Role.AGENT) {
      return true;
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
      where: {
        documentId,
        type: 'CLAIM',
        refId: { in: claimIds }
      }
    });
    return Boolean(link);
  }

  private canEdit(document: { ownerId: string }, user: RequestUser) {
    if (user.role === Role.ADMIN) {
      return true;
    }
    return user.role === Role.MEMBER && document.ownerId === user.id;
  }

  private canDelete(document: { ownerId: string; legalHold?: boolean }, user: RequestUser) {
    if (document.legalHold) {
      return false;
    }
    if (user.role === Role.ADMIN) {
      return true;
    }
    if (user.role === Role.AGENT) {
      return true;
    }
    return user.role === Role.MEMBER && document.ownerId === user.id;
  }
}
