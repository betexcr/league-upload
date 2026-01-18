import type { UploadInit, UploadSession, UploadTransport } from "@league/upload-core";

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type ApiFetchOptions = {
  getBaseUrl: () => string;
  getAuthToken?: () => string | null;
  onUnauthorized?: () => void;
};

export const createApiFetch = (options: ApiFetchOptions): ApiFetch => {
  return async (path: string, init: RequestInit = {}) => {
    const baseUrl = options.getBaseUrl();
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    const headers = new Headers(init.headers);
    const token = options.getAuthToken?.();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401) {
      options.onUnauthorized?.();
    }
    return response;
  };
};

export type TransportOptions = {
  apiFetch: ApiFetch;
  getFailMode?: () => { uploads: boolean };
};

export const createApiUploadTransport = (
  options: TransportOptions
): UploadTransport => {
  return {
    async initUpload(init: UploadInit): Promise<UploadSession> {
      const fail = options.getFailMode?.().uploads;
      const response = await options.apiFetch("/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fail-uploads": fail ? "1" : "0",
        },
        body: JSON.stringify({
          fileName: init.file.name,
          sizeBytes: init.file.size,
          mimeType: init.file.type,
          categories: init.metadata.categories,
          tags: init.metadata.tags,
          notes: init.metadata.notes,
          docDate: init.metadata.docDate,
          entityLinks: init.metadata.entityLinks,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to initialize upload");
      }
      return (await response.json()) as UploadSession;
    },
    async uploadChunk(
      url: string,
      chunk: Uint8Array,
      headers?: Record<string, string>
    ): Promise<string | undefined> {
      const fail = options.getFailMode?.().uploads;
      const uploadHeaders: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        ...(headers ?? {}),
        "x-fail-uploads": fail ? "1" : "0",
      };
      const response = await fetch(url, {
        method: "PUT",
        headers: uploadHeaders,
        body: chunk as unknown as BodyInit,
      });
      if (!response.ok) {
        throw new Error("Failed to upload chunk");
      }
      return response.headers.get("etag") ?? undefined;
    },
    async completeUpload(
      uploadId: string,
      payload?: Record<string, unknown>
    ): Promise<void> {
      const fail = options.getFailMode?.().uploads;
      const response = await options.apiFetch(`/uploads/${uploadId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fail-uploads": fail ? "1" : "0",
        },
        body: JSON.stringify(payload ?? {}),
      });
      if (!response.ok) {
        throw new Error("Failed to complete upload");
      }
    },
    async getOffset(): Promise<number> {
      return 0;
    },
  };
};
