import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createApiFetch, createApiUploadTransport, type UploadInit } from "./index";

const makeInit = (): UploadInit => ({
  file: { name: "doc.txt", size: 12, type: "text/plain" },
  metadata: {
    title: "Doc",
    categories: ["OTHER"],
    tags: [],
    entityLinks: [{ type: "PROFILE", id: "user_1" }],
  },
  context: { entityLinks: [{ type: "PROFILE", id: "user_1" }], source: "PROFILE" },
});

describe("createApiFetch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("prefixes base url and adds auth header", async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 } as Response);
    const apiFetch = createApiFetch({
      getBaseUrl: () => "https://api.test",
      getAuthToken: () => "token-123",
    });

    await apiFetch("/documents", { method: "GET" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.test/documents");
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("notifies on unauthorized response", async () => {
    const onUnauthorized = vi.fn();
    fetchMock.mockResolvedValueOnce({ status: 401 } as Response);
    const apiFetch = createApiFetch({
      getBaseUrl: () => "https://api.test",
      onUnauthorized,
    });

    await apiFetch("/documents", { method: "GET" });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("createApiUploadTransport", () => {
  it("throws when initUpload fails", async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce({ ok: false } as Response);
    const transport = createApiUploadTransport({ apiFetch });

    await expect(transport.initUpload(makeInit())).rejects.toThrow(
      "Failed to initialize upload"
    );
  });

  it("completes upload with payload", async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const transport = createApiUploadTransport({ apiFetch });

    await transport.completeUpload("upload_1", { parts: [] });

    expect(apiFetch).toHaveBeenCalledWith(
      "/uploads/upload_1/complete",
      expect.objectContaining({ method: "POST" })
    );
  });
});
