import type { Metadata } from "@league/types";
export type UploadStatus = "queued" | "uploading" | "paused" | "verifying" | "completed" | "failed" | "canceled";
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
    start(init: UploadInit, onProgress: (progress: UploadProgress) => void): Promise<{
        uploadId: string;
    }>;
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
export type TelemetryEvent = {
    name: "upload_started";
    uploadId: string;
    sizeBytes: number;
    mimeType: string;
} | {
    name: "upload_completed";
    uploadId: string;
    sizeBytes: number;
    durationMs: number;
} | {
    name: "upload_failed";
    uploadId: string;
    error: string;
};
export type UploadSession = {
    uploadId: string;
    engine: "tus" | "multipart";
    uploadUrl?: string;
    partSize?: number;
    parts?: Array<{
        partNumber: number;
        url: string;
    }>;
};
export type UploadTransport = {
    initUpload(init: UploadInit): Promise<UploadSession>;
    uploadChunk(url: string, chunk: Uint8Array, headers?: Record<string, string>): Promise<string | undefined>;
    completeUpload(uploadId: string, payload?: Record<string, unknown>): Promise<void>;
    getOffset?(uploadUrl: string): Promise<number>;
};
export type ChunkReader = (file: FileLike, start: number, end: number) => Promise<Uint8Array>;
export type QueueStore = {
    load(): Promise<UploadInit[]>;
    save(items: UploadInit[]): Promise<void>;
    clear(): Promise<void>;
};
export declare const createInMemoryQueueStore: () => QueueStore;
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
export declare class UploadClientImpl implements UploadClient {
    private readonly engine;
    private readonly autoStart;
    private readonly onTelemetry?;
    private readonly queueStore?;
    private readonly queue;
    private readonly listeners;
    private idCounter;
    constructor(options: UploadClientOptions);
    enqueue(items: UploadInit[]): Promise<UploadHandle[]>;
    restoreQueue(): Promise<UploadHandle[]>;
    on(event: UploadEvent, cb: UploadEventHandler): Unsub;
    listQueue(): UploadHandle[];
    retryAll(): void;
    startQueued(): Promise<void>;
    remove(uploadId: string): void;
    private enqueueInternal;
    private notify;
    private nextId;
    private persistQueue;
}
export declare const createUploadClient: (options: UploadClientOptions) => UploadClient;
export declare const createMockEngine: () => UploadEngine;
export declare const createTusEngine: (options: TusEngineOptions) => UploadEngine;
export declare const createMultipartEngine: (options: MultipartEngineOptions) => UploadEngine;
//# sourceMappingURL=index.d.ts.map