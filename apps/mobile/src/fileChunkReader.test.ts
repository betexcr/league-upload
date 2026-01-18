import { Buffer } from "buffer";
import { createFileSystemChunkReader } from "./fileChunkReader";
import * as FileSystem from "expo-file-system";

jest.mock("expo-file-system", () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

describe("createFileSystemChunkReader", () => {
  it("returns empty array when uri is missing", async () => {
    const reader = createFileSystemChunkReader();
    const result = await reader({ name: "doc", size: 10, type: "text/plain" }, 0, 4);
    expect(result).toEqual(new Uint8Array());
  });

  it("returns empty array for zero-length reads", async () => {
    const reader = createFileSystemChunkReader();
    const result = await reader(
      { name: "doc", size: 10, type: "text/plain", uri: "file://doc" },
      4,
      4
    );
    expect(result).toEqual(new Uint8Array());
  });

  it("reads base64 and converts to Uint8Array", async () => {
    const reader = createFileSystemChunkReader();
    const content = Buffer.from("hello");
    const base64 = content.toString("base64");
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(base64);

    const result = await reader(
      { name: "doc", size: 5, type: "text/plain", uri: "file://doc" },
      0,
      5
    );

    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith("file://doc", {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 5,
    });
    expect(result).toEqual(new Uint8Array(content));
  });
});
