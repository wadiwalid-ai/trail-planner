/**
 * SPIKE — Device-local PMTiles HTTP server via react-native-tcp-socket.
 *
 * Listens on 127.0.0.1:PORT, serves tiles at /{z}/{x}/{y}.pbf from a local
 * .pmtiles file. MapLibre is pointed at http://127.0.0.1:PORT/{z}/{x}/{y}.pbf.
 *
 * Approach B (device-local) delivery mechanism from the migration plan.
 * Requires a custom dev build — react-native-tcp-socket is a native module.
 *
 * REMOVE after spike report is written.
 */
import { Platform } from "react-native";
import { PMTiles } from "pmtiles";
import { ExpoFileSource } from "./expo-file-source";

// ─── Module-level singleton ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeServer: any = null;
let activePort = 0;
let activePM: PMTiles | null = null;

export interface LocalServerInfo {
  port: number;
  tileUrl: string;
  tilejsonUrl: string;
}

/**
 * Start (or restart) the local PMTiles HTTP server.
 * @param pmtilesFileUri  expo-file-system URI to the local .pmtiles file
 * @returns server info including port and ready-made tile URL template
 */
export async function startLocalTileServer(
  pmtilesFileUri: string,
): Promise<LocalServerInfo> {
  if (Platform.OS === "web") {
    throw new Error("Local tile server: not supported on web");
  }

  stopLocalTileServer();

  // Lazy import — crashes on Expo Go (native module missing)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TcpSocket = require("react-native-tcp-socket");

  activePM = new PMTiles(new ExpoFileSource(pmtilesFileUri));

  return new Promise<LocalServerInfo>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = TcpSocket.createServer((socket: any) => {
      handleConnection(socket, activePM!);
    });

    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr = server.address() as { port: number };
      activeServer = server;
      activePort = addr.port;

      resolve({
        port: addr.port,
        tileUrl: `http://127.0.0.1:${addr.port}/{z}/{x}/{y}.pbf`,
        tilejsonUrl: `http://127.0.0.1:${addr.port}/tilejson.json`,
      });
    });

    server.on("error", reject);
  });
}

export function stopLocalTileServer(): void {
  if (activeServer) {
    try {
      activeServer.close();
    } catch (_) {}
    activeServer = null;
    activePort = 0;
    activePM = null;
  }
}

export function getLocalServerPort(): number {
  return activePort;
}

// ─── Per-connection handler ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleConnection(socket: any, pm: PMTiles): void {
  let buffer = new Uint8Array(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket.on("data", async (rawData: any) => {
    // Normalise to Uint8Array
    const chunk: Uint8Array =
      rawData instanceof ArrayBuffer
        ? new Uint8Array(rawData)
        : rawData instanceof Uint8Array
          ? rawData
          : typeof rawData === "string"
            ? new TextEncoder().encode(rawData)
            : new Uint8Array(rawData as Buffer);

    const next = new Uint8Array(buffer.length + chunk.length);
    next.set(buffer, 0);
    next.set(chunk, buffer.length);
    buffer = next;

    // Wait for end of HTTP headers (\r\n\r\n)
    const headerEnd = findCrLfCrLf(buffer);
    if (headerEnd === -1) return;

    const headerStr = new TextDecoder().decode(buffer.slice(0, headerEnd));
    buffer = new Uint8Array(0); // reset for next request on same connection

    const firstLine = headerStr.split("\r\n")[0] ?? "";
    const urlPath = firstLine.split(" ")[1] ?? "/";

    // Route: /{z}/{x}/{y}.pbf  or  /{z}/{x}/{y}
    const tileMatch = urlPath.match(/\/(\d+)\/(\d+)\/(\d+)/);
    if (!tileMatch) {
      // Anything else → 200 OK with JSON status
      const body = JSON.stringify({ ok: true, server: "pmtiles-local-spike" });
      writeText(socket, 200, body);
      return;
    }

    const z = Number(tileMatch[1]);
    const x = Number(tileMatch[2]);
    const y = Number(tileMatch[3]);

    try {
      const tile = await pm.getZxy(z, x, y);
      if (!tile) {
        writeSimple(socket, 204);
      } else {
        writeBinary(socket, new Uint8Array(tile.data));
      }
    } catch (err) {
      console.error("[pmtiles-server] tile error", { z, x, y }, err);
      writeSimple(socket, 500);
    }
  });

  socket.on("error", () => {});
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

const ENC = new TextEncoder();

function findCrLfCrLf(buf: Uint8Array): number {
  for (let i = 0; i <= buf.length - 4; i++) {
    if (
      buf[i] === 0x0d &&
      buf[i + 1] === 0x0a &&
      buf[i + 2] === 0x0d &&
      buf[i + 3] === 0x0a
    ) {
      return i;
    }
  }
  return -1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeSimple(socket: any, status: number): void {
  const CORS = "Access-Control-Allow-Origin: *";
  socket.write(`HTTP/1.1 ${status}\r\n${CORS}\r\n\r\n`, "utf8");
  socket.destroy();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeText(socket: any, status: number, body: string): void {
  const CORS = "Access-Control-Allow-Origin: *";
  const header = `HTTP/1.1 ${status} OK\r\n${CORS}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n`;
  socket.write(header + body, "utf8");
  socket.destroy();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeBinary(socket: any, body: Uint8Array): void {
  const headerStr =
    "HTTP/1.1 200 OK\r\n" +
    "Content-Type: application/x-protobuf\r\n" +
    "Content-Encoding: gzip\r\n" +
    "Access-Control-Allow-Origin: *\r\n" +
    `Content-Length: ${body.byteLength}\r\n` +
    "\r\n";
  const headerBytes = ENC.encode(headerStr);
  const full = new Uint8Array(headerBytes.length + body.byteLength);
  full.set(headerBytes, 0);
  full.set(body, headerBytes.length);
  socket.write(full);
  socket.destroy();
}
