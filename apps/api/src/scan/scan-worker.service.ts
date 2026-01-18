import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SqsService } from '../storage/sqs.service';
import { ScanService } from './scan.service';
import { ScanEngineService } from './scan-engine.service';

@Injectable()
export class ScanWorkerService {
  constructor(
    private readonly sqs: SqsService,
    private readonly scan: ScanService,
    private readonly engine: ScanEngineService
  ) {}

  @Interval(5000)
  async pollQueue() {
    const messages = await this.sqs.receiveMessages();
    if (messages.length === 0) {
      return;
    }

    for (const message of messages) {
      if (!message.Body || !message.ReceiptHandle) {
        continue;
      }
      try {
        const body = JSON.parse(message.Body) as {
          uploadId: string;
          versionId?: string;
        };

        const scanResult = await this.engine.scanVersion(body.versionId ?? body.uploadId);
        await this.scan.handleCallback({
          uploadId: body.uploadId,
          result: scanResult.result,
          reason: scanResult.reason
        });

        await this.sqs.deleteMessage(message.ReceiptHandle);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('scan-worker-error', error);
      }
    }
  }
}
