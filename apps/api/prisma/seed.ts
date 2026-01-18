import { PrismaClient, Role, VersionStatus } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();

function resolveLocalStoragePath(envPath?: string) {
  if (envPath) {
    if (path.isAbsolute(envPath)) {
      return envPath;
    }
    const cwd = process.cwd();
    const apiDir = path.join(cwd, 'apps', 'api');
    if (envPath.startsWith('apps') && existsSync(apiDir) && cwd === path.dirname(apiDir)) {
      return path.join(cwd, envPath);
    }
    return path.resolve(cwd, envPath);
  }

  const cwd = process.cwd();
  const apiDir = path.join(cwd, 'apps', 'api');
  if (existsSync(apiDir)) {
    return path.join(apiDir, '.local-storage');
  }
  return path.join(cwd, '.local-storage');
}

async function main() {
  const users = [
    { email: 'member@league.test', role: Role.MEMBER },
    { email: 'agent@league.test', role: Role.AGENT },
    { email: 'admin@league.test', role: Role.ADMIN }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: user
    });
  }

  const agent = await prisma.user.findUnique({ where: { email: 'agent@league.test' } });
  if (agent) {
    await prisma.claimAssignment.upsert({
      where: { claimId: 'CLAIM-123' },
      update: { agentId: agent.id },
      create: { claimId: 'CLAIM-123', agentId: agent.id }
    });
  }

  const member = await prisma.user.findUnique({ where: { email: 'member@league.test' } });
  if (!member) {
    return;
  }

  const assetsDir = path.resolve(process.cwd(), '..', '..', 'docs', 'assets');
  const pdfPath = path.join(assetsDir, 'dummy.pdf');
  const pngPath = path.join(assetsDir, 'dummy.png');
  const pdfBuffer = await fs.readFile(pdfPath);
  const pngBuffer = await fs.readFile(pngPath);

  const s3Bucket = process.env.AWS_S3_BUCKET ?? '';
  const s3Region = process.env.AWS_REGION ?? 'us-east-1';
  const shouldUpload = process.env.SEED_UPLOAD_TO_S3 === 'true';
  const s3 = s3Bucket && shouldUpload ? new S3Client({ region: s3Region }) : null;
  const localStorageFlag = process.env.LOCAL_STORAGE;
  const localStorage =
    localStorageFlag === 'true' ||
    (localStorageFlag === undefined && (process.env.NODE_ENV ?? 'development') !== 'production');
  const localPath = resolveLocalStoragePath(process.env.LOCAL_STORAGE_PATH);

  const existingSeedDocs = await prisma.document.count({
    where: { ownerId: member.id, tags: { has: 'seed' } }
  });
  if (existingSeedDocs >= 5) {
    if (localStorage) {
      const docs = await prisma.document.findMany({
        where: { ownerId: member.id, tags: { has: 'seed' } },
        include: { versions: true }
      });

      for (const doc of docs) {
        const version = doc.versions.find((item) => item.id === doc.latestVersionId) ?? doc.versions[0];
        if (!version) {
          continue;
        }
        const buffer = doc.mimeType === 'image/png' ? pngBuffer : pdfBuffer;
        const targetPath = path.join(localPath, version.objectKey.replace(/\\/g, '/').replace(/\.\./g, ''));
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, buffer);
      }
    }
    return;
  }

  const seeds = [
    { title: 'Seed Receipt A', mimeType: 'application/pdf', buffer: pdfBuffer, fileName: 'dummy.pdf' },
    { title: 'Seed Receipt B', mimeType: 'application/pdf', buffer: pdfBuffer, fileName: 'dummy.pdf' },
    { title: 'Seed Receipt C', mimeType: 'application/pdf', buffer: pdfBuffer, fileName: 'dummy.pdf' },
    { title: 'Seed Image A', mimeType: 'image/png', buffer: pngBuffer, fileName: 'dummy.png' },
    { title: 'Seed Image B', mimeType: 'image/png', buffer: pngBuffer, fileName: 'dummy.png' }
  ];

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const objectKey = `seed/${member.id}/${Date.now()}-${index}-${seed.fileName}`;
    const sha256 = createHash('sha256').update(seed.buffer).digest('hex');

    if (localStorage) {
      const targetPath = path.join(localPath, objectKey.replace(/\\/g, '/').replace(/\\.\\./g, ''));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, seed.buffer);
    }

    if (s3 && s3Bucket) {
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            Body: seed.buffer,
            ContentType: seed.mimeType
          })
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('seed-upload-failed', error);
      }
    }

    const [document, version] = await prisma.$transaction(async (tx) => {
      const createdDocument = await tx.document.create({
        data: {
          ownerId: member.id,
          latestVersionId: null,
          title: seed.title,
          categories: ['SEED'],
          tags: ['seed'],
          notes: 'Seeded document',
          docDate: new Date(),
          sizeBytes: BigInt(seed.buffer.length),
          mimeType: seed.mimeType,
          entityLinks: {
            create: [{ type: 'PROFILE', refId: member.id }]
          }
        }
      });

      const createdVersion = await tx.version.create({
        data: {
          documentId: createdDocument.id,
          objectKey,
          sha256,
          status: VersionStatus.CLEAN
        }
      });

      const updatedDocument = await tx.document.update({
        where: { id: createdDocument.id },
        data: { latestVersionId: createdVersion.id }
      });

      return [updatedDocument, createdVersion];
    });

    await prisma.auditLog.create({
      data: {
        actorId: member.id,
        action: 'seed.document',
        targetId: document.id,
        meta: { versionId: version.id, objectKey }
      }
    });
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
