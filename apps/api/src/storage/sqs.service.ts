import { Injectable } from '@nestjs/common';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

export type ScanMessage = {
  uploadId: string;
  documentId: string;
  versionId: string;
};

@Injectable()
export class SqsService {
  private readonly client: SQSClient;
  private readonly queueUrl: string | undefined;
  private readonly useLocalstack: boolean;

  constructor() {
    this.useLocalstack = process.env.USE_LOCALSTACK === 'true';
    const endpoint = process.env.AWS_ENDPOINT_URL ?? process.env.LOCALSTACK_ENDPOINT;
    const credentials = this.useLocalstack
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
        }
      : undefined;
    this.client = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint,
      credentials
    });
    this.queueUrl = process.env.SQS_SCAN_QUEUE_URL;
  }

  async sendScanJob(message: ScanMessage) {
    if (!this.queueUrl) {
      return;
    }
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message)
      });
      await this.client.send(command);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('scan-queue-send-failed', error);
    }
  }

  async receiveMessages(maxNumber = 5, waitTimeSeconds = 10) {
    if (!this.queueUrl) {
      return [];
    }
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: maxNumber,
      WaitTimeSeconds: waitTimeSeconds
    });
    const response = await this.client.send(command);
    return response.Messages ?? [];
  }

  async deleteMessage(receiptHandle: string) {
    if (!this.queueUrl) {
      return;
    }
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle
    });
    await this.client.send(command);
  }
}
