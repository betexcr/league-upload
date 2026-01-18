import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScanCallbackDto } from './dto/scan-callback.dto';
import { AuditService } from '../common/audit.service';
import { VersionStatus } from '@prisma/client';

@Injectable()
export class ScanService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async handleCallback(payload: ScanCallbackDto) {
    const version = await this.prisma.version.findUnique({
      where: { id: payload.uploadId },
      include: { document: true }
    });

    if (!version) {
      throw new NotFoundException('Upload not found');
    }

    if (version.status !== VersionStatus.PROCESSING) {
      throw new BadRequestException('Version already scanned');
    }

    const status = payload.result === 'CLEAN' ? VersionStatus.CLEAN : VersionStatus.BLOCKED;

    await this.prisma.$transaction([
      this.prisma.version.update({
        where: { id: version.id },
        data: { status }
      }),
      ...(status === VersionStatus.CLEAN
        ? [
            this.prisma.document.update({
              where: { id: version.documentId },
              data: { latestVersionId: version.id }
            })
          ]
        : [])
    ]);

    await this.audit.log('scan.result', 'scan-worker', version.documentId, {
      uploadId: version.id,
      result: payload.result,
      reason: payload.reason
    });

    return { status: 'ok' };
  }
}
