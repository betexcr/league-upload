import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { S3Service } from '../src/storage/s3.service';
import { SqsService } from '../src/storage/sqs.service';
import { Role } from '@prisma/client';
import { buildToken } from './test-utils';

process.env.JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY ?? 'test-secret';
process.env.PREVIEW_URL_TTL_SECONDS = '300';
process.env.MAX_FILE_MB = '200';

const s3Mock = {
  createMultipartUpload: jest.fn(async () => 'upload-123'),
  signParts: jest.fn(async (_key: string, _uploadId: string, partCount: number) =>
    Array.from({ length: partCount }, (_, index) => ({ partNumber: index + 1, url: `https://s3/part-${index + 1}` }))
  ),
  completeMultipartUpload: jest.fn(async () => 'etag-123'),
  getPresignedGetUrl: jest.fn(async () => 'https://s3/get')
};

const sqsMock = {
  sendScanJob: jest.fn(async () => undefined),
  receiveMessages: jest.fn(async () => []),
  deleteMessage: jest.fn(async () => undefined)
};

describe('League Upload Management API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let memberToken: string;
  let memberId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(S3Service)
      .useValue(s3Mock)
      .overrideProvider(SqsService)
      .useValue(sqsMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.entityLink.deleteMany();
    await prisma.version.deleteMany();
    await prisma.document.deleteMany();
    await prisma.claimAssignment.deleteMany();
    await prisma.user.deleteMany();

    const member = await prisma.user.create({
      data: { email: 'member@league.test', role: Role.MEMBER }
    });
    memberId = member.id;
    memberToken = buildToken(member);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health status', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(200).expect({ status: 'ok' });
  });

  it('initializes an upload and completes it', async () => {
    const initResponse = await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'receipt.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['jan'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-1' }]
      })
      .expect(201);

    expect(initResponse.body.engine).toBe('multipart');
    expect(initResponse.body.parts.length).toBeGreaterThan(0);

    const completeResponse = await request(app.getHttpServer())
      .post(`/v1/uploads/${initResponse.body.uploadId}/complete`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        parts: [{ partNumber: 1, etag: 'etag-1' }],
        sizeBytes: 1024,
        sha256: 'abc'
      })
      .expect(201);

    expect(completeResponse.body.status).toBe('processing');
  });

  it('supports document CRUD and soft delete/restore', async () => {
    const initResponse = await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'id.pdf',
        sizeBytes: 2048,
        mimeType: 'application/pdf',
        categories: ['ID'],
        tags: ['gov'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-2' }]
      })
      .expect(201);

    const documentId = await prisma.document.findFirst({
      where: { ownerId: memberId },
      select: { id: true }
    });

    expect(documentId).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/v1/documents/${documentId?.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: 'New Title' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/v1/documents/${documentId?.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/v1/documents/${documentId?.id}/restore`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);
  });

  it('enforces ACLs for agents', async () => {
    const agent = await prisma.user.create({
      data: { email: 'agent1@league.test', role: Role.AGENT }
    });

    const tokenAgent = buildToken(agent);

    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'claim.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['claim'],
        entityLinks: [{ type: 'CLAIM', id: 'CLAIM-123' }]
      })
      .expect(201);

    const emptyList = await request(app.getHttpServer())
      .get('/v1/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);
    expect(emptyList.body.items.length).toBe(0);

    await prisma.claimAssignment.create({
      data: { claimId: 'CLAIM-123', agentId: agent.id }
    });

    const listResponse = await request(app.getHttpServer())
      .get('/v1/claims/CLAIM-123/documents')
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(200);

    expect(listResponse.body.items.length).toBe(1);
  });

  it('updates scan status via callback', async () => {
    const initResponse = await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'scan.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['scan'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-3' }]
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/uploads/${initResponse.body.uploadId}/complete`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        parts: [{ partNumber: 1, etag: 'etag-1' }],
        sizeBytes: 1024
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/scan/callback')
      .send({ uploadId: initResponse.body.uploadId, result: 'CLEAN' })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    expect(document?.latestVersionId).toBe(initResponse.body.uploadId);
  });

  it('returns preview url only for clean versions', async () => {
    const initResponse = await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'preview.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['preview'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-4' }]
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/uploads/${initResponse.body.uploadId}/complete`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        parts: [{ partNumber: 1, etag: 'etag-1' }],
        sizeBytes: 1024
      })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    await request(app.getHttpServer())
      .get(`/v1/documents/${document?.id}/preview-url`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/scan/callback')
      .send({ uploadId: initResponse.body.uploadId, result: 'CLEAN' })
      .expect(201);

    const preview = await request(app.getHttpServer())
      .get(`/v1/documents/${document?.id}/preview-url`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(preview.body.url).toBe('https://s3/get');
    expect(preview.body.expiresAt).toBeDefined();
  });

  it('starts a replacement upload for an existing document', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'replace.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['replace'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-5' }]
      })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    const replacement = await request(app.getHttpServer())
      .post(`/v1/documents/${document?.id}/replace`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ fileName: 'replace-v2.pdf', sizeBytes: 2048, mimeType: 'application/pdf' })
      .expect(201);

    expect(replacement.body.engine).toBe('multipart');
    expect(replacement.body.parts.length).toBeGreaterThan(0);
  });

  it('stores and returns annotations payload', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'annotate.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['annotate'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-6' }]
      })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    const annotations = [{ type: 'highlight', x: 10, y: 20 }];
    const response = await request(app.getHttpServer())
      .post(`/v1/documents/${document?.id}/annotations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ annotations })
      .expect(201);

    expect(response.body.annotations).toEqual(annotations);
  });

  it('filters documents and paginates with cursor', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'alpha.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['alpha'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-7' }]
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'bravo.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['ID'],
        tags: ['bravo'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-7' }]
      })
      .expect(201);

    const filtered = await request(app.getHttpServer())
      .get('/v1/documents?category=ID')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(filtered.body.items.length).toBe(1);
    expect(filtered.body.items[0].categories).toContain('ID');

    const list = await request(app.getHttpServer())
      .get('/v1/documents?limit=1')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(list.body.nextCursor).toBeDefined();

    const next = await request(app.getHttpServer())
      .get(`/v1/documents?cursor=${encodeURIComponent(list.body.nextCursor)}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(next.body.items.length).toBeGreaterThan(0);
  });

  it('supports search by q on title and tags', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'alpha-search.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['needle'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-11' }]
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'beta-search.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['other'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-11' }]
      })
      .expect(201);

    const titleMatch = await request(app.getHttpServer())
      .get('/v1/documents?q=alpha')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(titleMatch.body.items.length).toBe(1);
    expect(titleMatch.body.items[0].title).toContain('alpha');

    const tagMatch = await request(app.getHttpServer())
      .get('/v1/documents?q=needle')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(tagMatch.body.items.length).toBe(1);
    expect(tagMatch.body.items[0].tags).toContain('needle');
  });

  it('filters documents by ownerId for admins', async () => {
    const admin = await prisma.user.create({
      data: { email: 'admin1@league.test', role: Role.ADMIN }
    });
    const adminToken = buildToken(admin);

    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'owner-filter.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['owner'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-12' }]
      })
      .expect(201);

    const adminList = await request(app.getHttpServer())
      .get(`/v1/documents?ownerId=${memberId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminList.body.items.length).toBe(1);
    expect(adminList.body.items[0].ownerId).toBe(memberId);
  });

  it('filters documents by claim link', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'claim-filter.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['claim-filter'],
        entityLinks: [{ type: 'CLAIM', id: 'CLAIM-999' }]
      })
      .expect(201);

    const claimFiltered = await request(app.getHttpServer())
      .get('/v1/documents?linkType=CLAIM&linkId=CLAIM-999')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(claimFiltered.body.items.length).toBe(1);
    expect(claimFiltered.body.items[0].entityLinks[0].id).toBe('CLAIM-999');
  });

  it('prevents deletion under legal hold', async () => {
    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'legal.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['legal'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-8' }]
      })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    await prisma.document.update({
      where: { id: document!.id },
      data: { legalHold: true }
    });

    await request(app.getHttpServer())
      .delete(`/v1/documents/${document?.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('blocks preview for blocked scan result', async () => {
    const initResponse = await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'blocked.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['blocked'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-9' }]
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/uploads/${initResponse.body.uploadId}/complete`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        parts: [{ partNumber: 1, etag: 'etag-1' }],
        sizeBytes: 1024
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/scan/callback')
      .send({ uploadId: initResponse.body.uploadId, result: 'BLOCKED', reason: 'malware' })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    await request(app.getHttpServer())
      .get(`/v1/documents/${document?.id}/preview-url`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(400);
  });

  it('denies access to documents for unassigned agents', async () => {
    const agent = await prisma.user.create({
      data: { email: 'agent2@league.test', role: Role.AGENT }
    });
    const tokenAgent = buildToken(agent);

    await request(app.getHttpServer())
      .post('/v1/uploads')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        fileName: 'private.pdf',
        sizeBytes: 1024,
        mimeType: 'application/pdf',
        categories: ['RECEIPT'],
        tags: ['private'],
        entityLinks: [{ type: 'PROFILE', id: 'profile-10' }]
      })
      .expect(201);

    const document = await prisma.document.findFirst({
      where: { ownerId: memberId }
    });

    await request(app.getHttpServer())
      .get(`/v1/documents/${document?.id}`)
      .set('Authorization', `Bearer ${tokenAgent}`)
      .expect(403);
  });
});
