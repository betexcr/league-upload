import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryQueueStore,
  createMultipartEngine,
  createTusEngine,
  createUploadClient,
  type UploadEngine,
  type UploadInit,
} from "./index";

const makeInit = (size = 10): UploadInit => ({
  file: { name: "doc.txt", size, type: "text/plain" },
  metadata: {
    title: "Doc",
    categories: ["OTHER"],
    tags: [],
    entityLinks: [{ type: "PROFILE", id: "user_1" }],
  },
  context: { entityLinks: [{ type: "PROFILE", id: "user_1" }], source: "PROFILE" },
});

describe("createInMemoryQueueStore", () => {
  it("stores and clears items", async () => {
    const store = createInMemoryQueueStore();
    await store.save([makeInit()]);
    expect(await store.load()).toHaveLength(1);
    await store.clear();
    expect(await store.load()).toEqual([]);
  });
});

describe("createUploadClient", () => {
  it("queues items without auto-start", async () => {
    const engine: UploadEngine = {
      start: vi.fn(async () => ({ uploadId: "upload_1" })),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    };
    const store = createInMemoryQueueStore();
    const client = createUploadClient({ engine, autoStart: false, queueStore: store });
    const handles = await client.enqueue([makeInit()]);

    expect(handles[0].status).toBe("queued");
    expect((engine.start as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(await store.load()).toHaveLength(1);
  });

  it("starts queued items and completes", async () => {
    const engine: UploadEngine = {
      start: vi.fn(async (init, onProgress) => {
        onProgress({ bytesSent: init.file.size, totalBytes: init.file.size });
        return { uploadId: "upload_1" };
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    };
    const client = createUploadClient({ engine, autoStart: false });
    const [handle] = await client.enqueue([makeInit()]);
    await client.startQueued();

    expect(handle.status).toBe("completed");
    expect(engine.start).toHaveBeenCalledTimes(1);
  });
});

describe("createTusEngine", () => {
  it("uploads chunks in order and completes", async () => {
    const transport = {
      initUpload: vi.fn(async () => ({
        uploadId: "tus_1",
        uploadUrl: "https://upload.test/tus",
      })),
      uploadChunk: vi.fn(async () => "etag-1"),
      completeUpload: vi.fn(async () => {}),
    };
    const readChunk = vi.fn(async (_file, start: number, end: number) => {
      return new Uint8Array(Math.max(0, end - start));
    });
    const engine = createTusEngine({
      transport,
      readChunk,
      chunkSizeBytes: 4,
    });

    await engine.start(makeInit(10), vi.fn());

    expect(transport.uploadChunk).toHaveBeenCalledTimes(3);
    expect(transport.uploadChunk).toHaveBeenNthCalledWith(
      1,
      "https://upload.test/tus",
      expect.any(Uint8Array),
      expect.objectContaining({ "Upload-Offset": "0" })
    );
    expect(transport.uploadChunk).toHaveBeenNthCalledWith(
      2,
      "https://upload.test/tus",
      expect.any(Uint8Array),
      expect.objectContaining({ "Upload-Offset": "4" })
    );
    expect(transport.uploadChunk).toHaveBeenNthCalledWith(
      3,
      "https://upload.test/tus",
      expect.any(Uint8Array),
      expect.objectContaining({ "Upload-Offset": "8" })
    );
    expect(transport.completeUpload).toHaveBeenCalledWith("tus_1");
  });
});

describe("createMultipartEngine", () => {
  it("uploads parts and completes with part metadata", async () => {
    const transport = {
      initUpload: vi.fn(async () => ({
        uploadId: "multi_1",
        parts: [
          { partNumber: 1, url: "https://upload.test/part1" },
          { partNumber: 2, url: "https://upload.test/part2" },
        ],
      })),
      uploadChunk: vi.fn(async (_url: string) => "etag"),
      completeUpload: vi.fn(async () => {}),
    };
    const readChunk = vi.fn(async (_file, start: number, end: number) => {
      return new Uint8Array(Math.max(0, end - start));
    });
    const engine = createMultipartEngine({
      transport,
      readChunk,
      partSizeBytes: 5,
      concurrency: 2,
    });

    await engine.start(makeInit(9), vi.fn());

    expect(transport.uploadChunk).toHaveBeenCalledTimes(2);
    expect(transport.completeUpload).toHaveBeenCalledWith(
      "multi_1",
      expect.objectContaining({ parts: expect.any(Array), sizeBytes: 9 })
    );
  });
});
