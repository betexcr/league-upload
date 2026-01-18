import { Injectable } from '@nestjs/common';
import * as net from 'net';

type ClamAvResult = { result: 'CLEAN' } | { result: 'BLOCKED'; reason: string };

@Injectable()
export class ClamAvService {
  private readonly enabled = process.env.SCAN_FEATURE_CLAMAV === 'true';
  private readonly host = process.env.CLAMAV_HOST ?? 'localhost';
  private readonly port = Number(process.env.CLAMAV_PORT ?? 3310);
  private readonly timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 15000);

  async scanBuffer(buffer: Buffer): Promise<ClamAvResult> {
    if (!this.enabled) {
      throw new Error('ClamAV scanning disabled');
    }

    return new Promise<ClamAvResult>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      const cleanup = (error?: Error) => {
        if (error) {
          reject(error);
        }
        socket.removeAllListeners();
      };

      socket.setTimeout(this.timeoutMs, () => {
        socket.destroy(new Error('ClamAV scan timed out'));
      });

      socket.on('error', (error) => {
        cleanup(error);
      });

      socket.on('data', (data) => {
        chunks.push(Buffer.from(data));
      });

      socket.on('end', () => {
        const response = Buffer.concat(chunks).toString('utf8').trim();
        if (!response) {
          cleanup(new Error('Empty ClamAV response'));
          return;
        }
        if (response.includes('FOUND')) {
          resolve({ result: 'BLOCKED', reason: response.replace(/^stream:\s*/i, '') });
          return;
        }
        if (response.endsWith('OK')) {
          resolve({ result: 'CLEAN' });
          return;
        }
        cleanup(new Error(`Unexpected ClamAV response: ${response}`));
      });

      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
          const slice = buffer.subarray(offset, offset + chunkSize);
          const sizeBuffer = Buffer.alloc(4);
          sizeBuffer.writeUInt32BE(slice.length, 0);
          socket.write(sizeBuffer);
          socket.write(slice);
        }
        const endBuffer = Buffer.alloc(4);
        endBuffer.writeUInt32BE(0, 0);
        socket.write(endBuffer);
        socket.end();
      });
    });
  }
}
