/**
 * SPIKE — PMTiles source backed by expo-file-system byte-range reads.
 *
 * Uses expo-file-system's legacy readAsStringAsync with position+length options,
 * which is available in SDK 54 and returns base64-encoded bytes for a given
 * byte range. No additional native module required.
 *
 * This class satisfies the pmtiles.Source interface so it can be passed directly
 * to `new PMTiles(source)`.
 *
 * REMOVE after spike report is written.
 */
import * as FileSystem from "expo-file-system";

export class ExpoFileSource {
  constructor(private readonly fileUri: string) {}

  getKey(): string {
    return this.fileUri;
  }

  async getBytes(
    offset: number,
    length: number,
  ): Promise<{
    data: ArrayBuffer;
    etag: undefined;
    expires: undefined;
    cacheControl: undefined;
  }> {
    const base64 = await (FileSystem as any).readAsStringAsync(this.fileUri, {
      encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
      position: offset,
      length,
    });

    // Decode base64 → binary
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    return {
      data: bytes.buffer,
      etag: undefined,
      expires: undefined,
      cacheControl: undefined,
    };
  }
}
