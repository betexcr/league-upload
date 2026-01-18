export const createInMemoryQueueStore = () => {
    let items = [];
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
class UploadHandleImpl {
    constructor(id, init, engine, notify, onTelemetry, onStateChange) {
        this.status = "queued";
        this.id = id;
        this.init = init;
        this.engine = engine;
        this.notify = notify;
        this.onTelemetry = onTelemetry;
        this.onStateChange = onStateChange;
        this.progress = { bytesSent: 0, totalBytes: init.file.size };
    }
    pause() {
        if (this.uploadId && this.status === "uploading") {
            this.status = "paused";
            void this.engine.pause(this.uploadId);
            this.notify("status", this);
            this.onStateChange?.();
        }
    }
    resume() {
        if (this.uploadId && this.status === "paused") {
            this.status = "uploading";
            void this.engine.resume(this.uploadId);
            this.notify("status", this);
            this.onStateChange?.();
        }
    }
    cancel() {
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
    retry() {
        if (this.status === "failed") {
            this.error = undefined;
            this.status = "queued";
            this.notify("status", this);
            this.onStateChange?.();
        }
    }
    async start() {
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
        }
        catch (error) {
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
    getInit() {
        return this.init;
    }
}
export class UploadClientImpl {
    constructor(options) {
        this.queue = [];
        this.listeners = new Map();
        this.idCounter = 0;
        this.engine = options.engine;
        this.autoStart = options.autoStart ?? true;
        this.onTelemetry = options.onTelemetry;
        this.queueStore = options.queueStore;
    }
    async enqueue(items) {
        const handles = this.enqueueInternal(items);
        await this.persistQueue();
        if (this.autoStart) {
            await Promise.all(handles.map((handle) => handle.start()));
        }
        return handles;
    }
    async restoreQueue() {
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
    on(event, cb) {
        const set = this.listeners.get(event) ?? new Set();
        set.add(cb);
        this.listeners.set(event, set);
        return () => {
            set.delete(cb);
        };
    }
    listQueue() {
        return [...this.queue];
    }
    retryAll() {
        const failed = this.queue.filter((handle) => handle.status === "failed");
        for (const handle of failed) {
            handle.retry();
        }
        if (this.autoStart) {
            void Promise.all(failed.map((handle) => handle.start()));
        }
    }
    async startQueued() {
        const queued = this.queue.filter((handle) => handle.status === "queued");
        await Promise.all(queued.map((handle) => handle.start()));
    }
    remove(uploadId) {
        const index = this.queue.findIndex((handle) => handle.id === uploadId);
        if (index === -1) {
            return;
        }
        const [handle] = this.queue.splice(index, 1);
        handle.cancel();
        void this.persistQueue();
    }
    enqueueInternal(items) {
        const handles = items.map((item) => {
            const handle = new UploadHandleImpl(this.nextId(), item, this.engine, this.notify.bind(this), this.onTelemetry, () => {
                void this.persistQueue();
            });
            this.queue.push(handle);
            return handle;
        });
        return handles;
    }
    notify(event, handle) {
        const set = this.listeners.get(event);
        if (!set) {
            return;
        }
        for (const cb of set) {
            cb(handle);
        }
    }
    nextId() {
        this.idCounter += 1;
        return `upload_${this.idCounter}`;
    }
    async persistQueue() {
        if (!this.queueStore) {
            return;
        }
        const pending = this.queue.filter((handle) => ["queued", "uploading", "paused"].includes(handle.status));
        await this.queueStore.save(pending.map((handle) => handle.getInit()));
    }
}
export const createUploadClient = (options) => new UploadClientImpl(options);
export const createMockEngine = () => {
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
        async pause() { },
        async resume() { },
        async cancel() { },
    };
};
export const createTusEngine = (options) => {
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
        async pause() { },
        async resume() { },
        async cancel() { },
    };
};
export const createMultipartEngine = (options) => {
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
            const uploadedParts = [];
            const uploadPart = async (part) => {
                const start = (part.partNumber - 1) * partSize;
                const end = Math.min(total, start + partSize);
                const chunk = await options.readChunk(init.file, start, end);
                const etag = (await options.transport.uploadChunk(part.url, chunk)) ??
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
        async pause() { },
        async resume() { },
        async cancel() { },
    };
};
//# sourceMappingURL=index.js.map