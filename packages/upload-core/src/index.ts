import type { Metadata } from "@league/types";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "verifying"
  | "completed"
  | "failed"
  | "canceled";

export type FileLike = {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  uri?: string;
  blob?: Blob;
};

export interface UploadInit {
  file: FileLike;
  metadata: Metadata;
  context: {
    entityLinks: Metadata["entityLinks"];
    source: "PROFILE" | "CLAIM" | "RECURRING";
  };
}

export interface UploadProgress {
  bytesSent: number;
  totalBytes: number;
}

export interface UploadHandle {
  id: string;
  status: UploadStatus;
  progress: UploadProgress;
  error?: string;
  readonly init: UploadInit;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  retry(): void;
}

export type UploadEvent = "progress" | "status" | "completed" | "failed";
export type UploadEventHandler = (u: UploadHandle) => void;
export type Unsub = () => void;

export interface UploadClient {
  enqueue(items: UploadInit[]): Promise<UploadHandle[]>;
  on(event: UploadEvent, cb: UploadEventHandler): Unsub;
  listQueue(): UploadHandle[];
  restoreQueue(): Promise<UploadHandle[]>;
  remove(uploadId: string): void;
  retryAll(): void;
  startQueued(): Promise<void>;
}

export type UploadEngine = {
  start(
    init: UploadInit,
    onProgress: (progress: UploadProgress) => void
  ): Promise<{ uploadId: string }>;
  pause(uploadId: string): Promise<void>;
  resume(uploadId: string): Promise<void>;
  cancel(uploadId: string): Promise<void>;
};

export type UploadClientOptions = {
  engine: UploadEngine;
  autoStart?: boolean;
  onTelemetry?: (event: TelemetryEvent) => void;
  queueStore?: QueueStore;
};

export type TelemetryEvent =
  | {
      name: "upload_started";
      uploadId: string;
      sizeBytes: number;
      mimeType: string;
    }
  | {
      name: "upload_completed";
      uploadId: string;
      sizeBytes: number;
      durationMs: number;
    }
  | {
      name: "upload_failed";
      uploadId: string;
      error: string;
    };

export type UploadSession = {
  uploadId: string;
  engine: "tus" | "multipart";
  uploadUrl?: string;
  partSize?: number;
  parts?: Array<{ partNumber: number; url: string }>;
};

export type UploadTransport = {
  initUpload(init: UploadInit): Promise<UploadSession>;
  uploadChunk(
    url: string,
    chunk: Uint8Array,
    headers?: Record<string, string>
  ): Promise<string | undefined>;
  completeUpload(
    uploadId: string,
    payload?: Record<string, unknown>
  ): Promise<void>;
  getOffset?(uploadUrl: string): Promise<number>;
};

export type ChunkReader = (
  file: FileLike,
  start: number,
  end: number
) => Promise<Uint8Array>;

export type QueueStore = {
  load(): Promise<UploadInit[]>;
  save(items: UploadInit[]): Promise<void>;
  clear(): Promise<void>;
};

export const createInMemoryQueueStore = (): QueueStore => {
  let items: UploadInit[] = [];
  return {
    async load() {
      return items;
    },
    async save(nextItems) {
      items = nextItems;
    },
    async clear() {
      items = [];
    },
  };
};

export type TusEngineOptions = {
  transport: UploadTransport;
  readChunk: ChunkReader;
  chunkSizeBytes?: number;
};

export type MultipartEngineOptions = {
  transport: UploadTransport;
  readChunk: ChunkReader;
  partSizeBytes?: number;
  concurrency?: number;
};

class UploadHandleImpl implements UploadHandle {
  public status: UploadStatus = "queued";
  public progress: UploadProgress;
  public error?: string;
  public readonly init: UploadInit;

  private readonly engine: UploadEngine;
  private readonly notify: (event: UploadEvent, handle: UploadHandle) => void;
  private readonly onTelemetry?: (event: TelemetryEvent) => void;
  private readonly onStateChange?: () => void;
  private startedAt?: number;
  private uploadId?: string;

  constructor(
    id: string,
    init: UploadInit,
    engine: UploadEngine,
    notify: (event: UploadEvent, handle: UploadHandle) => void,
    onTelemetry?: (event: TelemetryEvent) => void,
    onStateChange?: () => void
  ) {
    this.id = id;
    this.init = init;
    this.engine = engine;
    this.notify = notify;
    this.onTelemetry = onTelemetry;
    this.onStateChange = onStateChange;
    this.progress = { bytesSent: 0, totalBytes: init.file.size };
  }

  public readonly id: string;

  pause(): void {
    if (this.uploadId && this.status === "uploading") {
      this.status = "paused";
      void this.engine.pause(this.uploadId);
      this.notify("status", this);
      this.onStateChange?.();
    }
  }

  resume(): void {
    if (this.uploadId && this.status === "paused") {
      this.status = "uploading";
      void this.engine.resume(this.uploadId);
      this.notify("status", this);
      this.onStateChange?.();
    }
  }

  cancel(): void {
    if (this.status === "canceled") {
      return;
    }
    this.status = "canceled";
    if (this.uploadId) {
      void this.engine.cancel(this.uploadId);
    }
    this.notify("status", this);
    this.onStateChange?.();
  }

  retry(): void {
    if (this.status === "failed") {
      this.error = undefined;
      this.status = "queued";
      this.notify("status", this);
      this.onStateChange?.();
    }
  }

  async start(): Promise<void> {
    if (this.status !== "queued") {
      return;
    }
    this.status = "uploading";
    this.startedAt = Date.now();
    this.notify("status", this);
    this.onStateChange?.();
    this.onTelemetry?.({
      name: "upload_started",
      uploadId: this.id,
      sizeBytes: this.init.file.size,
      mimeType: this.init.file.type,
    });

    try {
      const { uploadId } = await this.engine.start(this.init, (progress) => {
        this.progress = progress;
        this.notify("progress", this);
      });
      this.uploadId = uploadId;
      this.status = "verifying";
      this.notify("status", this);
      this.onStateChange?.();
      this.status = "completed";
      this.notify("completed", this);
      this.onStateChange?.();
      const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
      this.onTelemetry?.({
        name: "upload_completed",
        uploadId: this.id,
        sizeBytes: this.init.file.size,
        durationMs,
      });
    } catch (error) {
      this.status = "failed";
      this.error = error instanceof Error ? error.message : "Upload failed";
      this.notify("failed", this);
      this.onStateChange?.();
      this.onTelemetry?.({
        name: "upload_failed",
        uploadId: this.id,
        error: this.error,
      });
    }
  }

  getInit(): UploadInit {
    return this.init;
  }
}

export class UploadClientImpl implements UploadClient {
  private readonly engine: UploadEngine;
  private readonly autoStart: boolean;
  private readonly onTelemetry?: (event: TelemetryEvent) => void;
  private readonly queueStore?: QueueStore;
  private readonly queue: UploadHandleImpl[] = [];
  private readonly listeners = new Map<UploadEvent, Set<UploadEventHandler>>();
  private idCounter = 0;

  constructor(options: UploadClientOptions) {
    this.engine = options.engine;
    this.autoStart = options.autoStart ?? true;
    this.onTelemetry = options.onTelemetry;
    this.queueStore = options.queueStore;
  }

  async enqueue(items: UploadInit[]): Promise<UploadHandle[]> {
    const handles = this.enqueueInternal(items);
    await this.persistQueue();

    if (this.autoStart) {
      await Promise.all(handles.map((handle) => handle.start()));
    }

    return handles;
  }

  async restoreQueue(): Promise<UploadHandle[]> {
    if (!this.queueStore) {
      return [];
    }
    const items = await this.queueStore.load();
    if (!items.length) {
      return [];
    }
    const handles = this.enqueueInternal(items);
    await this.persistQueue();
    if (this.autoStart) {
      await Promise.all(handles.map((handle) => handle.start()));
    }
    return handles;
  }

  on(event: UploadEvent, cb: UploadEventHandler): Unsub {
    const set = this.listeners.get(event) ?? new Set<UploadEventHandler>();
    set.add(cb);
    this.listeners.set(event, set);
    return () => {
      set.delete(cb);
    };
  }

  listQueue(): UploadHandle[] {
    return [...this.queue];
  }

  retryAll(): void {
    const failed = this.queue.filter((handle) => handle.status === "failed");
    for (const handle of failed) {
      handle.retry();
    }
    if (this.autoStart) {
      void Promise.all(failed.map((handle) => handle.start()));
    }
  }

  async startQueued(): Promise<void> {
    const queued = this.queue.filter((handle) => handle.status === "queued");
    await Promise.all(queued.map((handle) => handle.start()));
  }

  remove(uploadId: string): void {
    const index = this.queue.findIndex((handle) => handle.id === uploadId);
    if (index === -1) {
      return;
    }
    const [handle] = this.queue.splice(index, 1);
    handle.cancel();
    void this.persistQueue();
  }

  private enqueueInternal(items: UploadInit[]): UploadHandleImpl[] {
    const handles = items.map((item) => {
      const handle = new UploadHandleImpl(
        this.nextId(),
        item,
        this.engine,
        this.notify.bind(this),
        this.onTelemetry,
        () => {
          void this.persistQueue();
        }
      );
      this.queue.push(handle);
      return handle;
    });

    return handles;
  }

  private notify(event: UploadEvent, handle: UploadHandle): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const cb of set) {
      cb(handle);
    }
  }

  private nextId(): string {
    this.idCounter += 1;
    return `upload_${this.idCounter}`;
  }

  private async persistQueue(): Promise<void> {
    if (!this.queueStore) {
      return;
    }
    const pending = this.queue.filter((handle) =>
      ["queued", "uploading", "paused"].includes(handle.status)
    );
    await this.queueStore.save(pending.map((handle) => handle.getInit()));
  }
}

export const createUploadClient = (options: UploadClientOptions): UploadClient =>
  new UploadClientImpl(options);

export const createMockEngine = (): UploadEngine => {
  return {
    async start(init, onProgress) {
      const total = init.file.size;
      const steps = Math.max(1, Math.floor(total / (5 * 1024 * 1024)));
      let sent = 0;
      for (let i = 0; i < steps; i += 1) {
        sent = Math.min(total, sent + Math.ceil(total / steps));
        onProgress({ bytesSent: sent, totalBytes: total });
      }
      return { uploadId: `mock_${Date.now()}` };
    },
    async pause() {},
    async resume() {},
    async cancel() {},
  };
};

export const createTusEngine = (options: TusEngineOptions): UploadEngine => {
  const chunkSize = options.chunkSizeBytes ?? 8 * 1024 * 1024;
  return {
    async start(init, onProgress) {
      const session = await options.transport.initUpload(init);
      if (!session.uploadUrl) {
        throw new Error("Missing tus upload URL");
      }
      const total = init.file.size;
      let offset = options.transport.getOffset
        ? await options.transport.getOffset(session.uploadUrl)
        : 0;

      while (offset < total) {
        const nextOffset = Math.min(total, offset + chunkSize);
        const chunk = await options.readChunk(init.file, offset, nextOffset);
        await options.transport.uploadChunk(session.uploadUrl, chunk, {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
        });
        offset = nextOffset;
        onProgress({ bytesSent: offset, totalBytes: total });
      }

      await options.transport.completeUpload(session.uploadId);
      return { uploadId: session.uploadId };
    },
    async pause() {},
    async resume() {},
    async cancel() {},
  };
};

export const createMultipartEngine = (
  options: MultipartEngineOptions
): UploadEngine => {
  const partSize = options.partSizeBytes ?? 10 * 1024 * 1024;
  const concurrency = options.concurrency ?? 4;
  return {
    async start(init, onProgress) {
      const session = await options.transport.initUpload(init);
      if (!session.parts || session.parts.length === 0) {
        throw new Error("Multipart upload requires pre-signed part URLs.");
      }

      const total = init.file.size;
      let uploadedBytes = 0;
      const queue = [...session.parts];
      const uploadedParts: Array<{ partNumber: number; etag: string }> = [];
      const uploadPart = async (part: { partNumber: number; url: string }) => {
        const start = (part.partNumber - 1) * partSize;
        const end = Math.min(total, start + partSize);
        const chunk = await options.readChunk(init.file, start, end);
        const etag =
          (await options.transport.uploadChunk(part.url, chunk)) ??
          `mock-etag-${part.partNumber}-${Date.now()}`;
        uploadedBytes += chunk.byteLength;
        uploadedParts.push({ partNumber: part.partNumber, etag });
        onProgress({ bytesSent: uploadedBytes, totalBytes: total });
      };

      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          const part = queue.shift();
          if (!part) {
            return;
          }
          await uploadPart(part);
        }
      });

      await Promise.all(workers);
      await options.transport.completeUpload(session.uploadId, {
        parts: uploadedParts,
        sizeBytes: total,
      });
      return { uploadId: session.uploadId };
    },
    async pause() {},
    async resume() {},
    async cancel() {},
  };
};
