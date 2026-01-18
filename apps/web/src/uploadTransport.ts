import type { ChunkReader, FileLike, UploadTransport } from "@league/upload-core";
import { createApiUploadTransport } from "@league/app-client";
import { apiFetch } from "./apiClient";

export type TransportOptions = {
  getFailMode?: () => { uploads: boolean };
};

export const createFetchTransport = (
  options: TransportOptions = {}
): UploadTransport => {
  return createApiUploadTransport({ apiFetch, getFailMode: options.getFailMode });
};

export const createBlobChunkReader = (): ChunkReader => {
  return async (file: FileLike, start: number, end: number) => {
    if (!file.blob) {
      return new Uint8Array();
    }
    const slice = file.blob.slice(start, end);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  };
};
