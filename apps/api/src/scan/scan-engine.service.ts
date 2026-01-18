import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { S3Service } from '../storage/s3.service';
import { ClamAvService } from './clamav.service';
import { VersionStatus } from '@prisma/client';

type ScanResult = { result: 'CLEAN' | 'BLOCKED'; reason?: string; source: string };

@Injectable()
export class ScanEngineService {
  private readonly engine = process.env.SCAN_ENGINE ?? 'local';
  private readonly allowSkip = process.env.SCAN_ALLOW_SKIP !== 'false';
  private readonly awsGuardduty = process.env.SCAN_FEATURE_GUARDDUTY === 'true';
  private readonly awsMacie = process.env.SCAN_FEATURE_MACIE === 'true';
  private readonly awsPlaceholder = process.env.SCAN_AWS_PLACEHOLDER === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly clamav: ClamAvService
  ) {}

  async scanVersion(versionId: string): Promise<ScanResult> {
    const version = await this.prisma.version.findUnique({ where: { id: versionId } });
    if (!version) {
      throw new Error('Scan version not found');
    }
    if (version.status !== VersionStatus.PROCESSING) {
      return { result: 'CLEAN', source: 'skip', reason: 'already-scanned' };
    }

    if (this.engine === 'aws') {
      return this.scanAws(version.objectKey);
    }
    return this.scanLocal(version.objectKey);
  }

  private async scanLocal(objectKey: string): Promise<ScanResult> {
    if (!this.allowSkip) {
      throw new Error('Local scan disabled');
    }
    try {
      const buffer = await this.s3.getObjectBuffer(objectKey);
      const result = await this.clamav.scanBuffer(buffer);
      if (result.result === 'BLOCKED') {
        return { result: 'BLOCKED', reason: result.reason, source: 'clamav' };
      }
      return { result: 'CLEAN', source: 'clamav' };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ClamAV scanning disabled')) {
        return { result: 'CLEAN', source: 'clamav', reason: 'clamav-disabled' };
      }
      throw error;
    }
  }

  private async scanAws(_objectKey: string): Promise<ScanResult> {
    if (!this.awsGuardduty && !this.awsMacie) {
      if (this.allowSkip) {
        return { result: 'CLEAN', source: 'aws', reason: 'aws-scan-disabled' };
      }
      throw new Error('AWS scan disabled');
    }
    if (!this.awsPlaceholder) {
      throw new Error('AWS scan integrations not configured');
    }
    return {
      result: 'CLEAN',
      source: 'aws',
      reason: `placeholder:${this.awsGuardduty ? 'guardduty' : ''}${this.awsMacie ? '+macie' : ''}`
    };
  }
}
