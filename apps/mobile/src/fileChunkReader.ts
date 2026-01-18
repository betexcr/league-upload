import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import type { ChunkReader, FileLike } from "@league/upload-core";

export const createFileSystemChunkReader = (): ChunkReader => {
  return async (file: FileLike, start: number, end: number) => {
    if (!file.uri) {
      return new Uint8Array();
    }
    const length = Math.max(end - start, 0);
    if (length === 0) {
      return new Uint8Array();
    }
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: start,
      length,
    });
    const buffer = Buffer.from(base64, "base64");
    return new Uint8Array(buffer);
  };
};
