import { Injectable } from '@nestjs/common';
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID, createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { resolveLocalStoragePath } from './local-storage.util';

export type PresignedPart = { partNumber: number; url: string };

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly localStorage: boolean;
  private readonly localPath: string;
  private readonly localBaseUrl: string;
  private readonly useLocalstack: boolean;

  constructor() {
    this.region = process.env.AWS_REGION ?? 'us-east-1';
    this.bucket = process.env.AWS_S3_BUCKET ?? '';
    this.useLocalstack = process.env.USE_LOCALSTACK === 'true';
    const endpoint = process.env.AWS_ENDPOINT_URL ?? process.env.LOCALSTACK_ENDPOINT;
    const credentials = this.useLocalstack
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
        }
      : undefined;
    this.client = new S3Client({
      region: this.region,
      endpoint,
      forcePathStyle: this.useLocalstack,
      credentials
    });
    const localStorageFlag = process.env.LOCAL_STORAGE;
    this.localStorage =
      !this.useLocalstack &&
      (localStorageFlag === 'true' ||
        (localStorageFlag === undefined && (process.env.NODE_ENV ?? 'development') !== 'production'));
    this.localPath = resolveLocalStoragePath(process.env.LOCAL_STORAGE_PATH);
    const port = Number(process.env.PORT ?? 8080);
    this.localBaseUrl = process.env.LOCAL_BASE_URL ?? `http://localhost:${port}/v1`;
  }

  async createMultipartUpload(objectKey: string, contentType: string) {
    if (this.localStorage) {
      const uploadId = randomUUID();
      await this.ensureLocalDir(path.join(this.localPath, 'multipart', uploadId));
      await this.ensureLocalDir(path.dirname(this.resolveLocalPath(objectKey)));
      return uploadId;
    }
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType
    });
    const response = await this.client.send(command);
    if (!response.UploadId) {
      throw new Error('Failed to create multipart upload');
    }
    return response.UploadId;
  }

  async signParts(objectKey: string, uploadId: string, partCount: number): Promise<PresignedPart[]> {
    if (this.localStorage) {
      return Array.from({ length: partCount }, (_, index) => ({
        partNumber: index + 1,
        url: `${this.localBaseUrl}/local-storage/multipart/${uploadId}/part/${index + 1}`
      }));
    }
    const parts: PresignedPart[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber
      });
      const url = await getSignedUrl(this.client, command, { expiresIn: 900 });
      parts.push({ partNumber, url });
    }
    return parts;
  }

  async completeMultipartUpload(objectKey: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    if (this.localStorage) {
      try {
        const targetPath = this.resolveLocalPath(objectKey);
        await this.ensureLocalDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, Buffer.alloc(0));
        for (const part of parts.sort((a, b) => a.partNumber - b.partNumber)) {
          const partPath = path.join(this.localPath, 'multipart', uploadId, `part-${part.partNumber}`);
          const buffer = await fs.readFile(partPath);
          await fs.writeFile(targetPath, buffer, { flag: 'a' });
        }
        const data = await fs.readFile(targetPath);
        return createHash('md5').update(data).digest('hex');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('local-storage-complete-failed', { uploadId, objectKey, error });
        throw error;
      }
    }
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag
        }))
      }
    });
    const response = await this.client.send(command);
    return response.ETag ?? null;
  }

  async getPresignedGetUrl(objectKey: string, ttlSeconds: number) {
    if (this.localStorage) {
      const localPath = this.resolveLocalPath(objectKey);
      try {
        const stat = await fs.stat(localPath);
        if (stat.size === 0) {
          throw new Error('Local object empty');
        }
      } catch (error) {
        throw new Error('Local object not found');
      }
      const encoded = encodeURIComponent(objectKey);
      return `${this.localBaseUrl}/local-storage/object?key=${encoded}`;
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async getObjectBuffer(objectKey: string) {
    if (this.localStorage) {
      const localPath = this.resolveLocalPath(objectKey);
      return fs.readFile(localPath);
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });
    const response = await this.client.send(command);
    const body = response.Body;
    if (!body || typeof (body as Readable).on !== 'function') {
      throw new Error('Missing object body');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private resolveLocalPath(objectKey: string) {
    const normalized = objectKey.replace(/\\/g, '/').replace(/\.\./g, '');
    return path.join(this.localPath, normalized);
  }

  private async ensureLocalDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }
}
