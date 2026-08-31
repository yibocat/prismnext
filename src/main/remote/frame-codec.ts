import {
  MAX_REMOTE_FRAME_BYTES,
  parseRemoteFrame,
  stringifyRemoteFrame,
  type RemoteFrame,
} from "../../shared/remote";

export class RemoteFrameTooLargeError extends Error {
  constructor() {
    super("remote frame exceeds 8 MiB");
    this.name = "RemoteFrameTooLargeError";
  }
}

/** Incremental NDJSON decoder — one JSON object per line. */
export class NdjsonFrameCodec {
  private buffer = "";

  push(chunk: string | Buffer): RemoteFrame[] {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const frames: RemoteFrame[] = [];
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) {
        if (Buffer.byteLength(this.buffer, "utf8") > MAX_REMOTE_FRAME_BYTES) {
          this.buffer = "";
          throw new RemoteFrameTooLargeError();
        }
        break;
      }
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, "utf8") > MAX_REMOTE_FRAME_BYTES) {
        throw new RemoteFrameTooLargeError();
      }
      frames.push(parseRemoteFrame(line));
    }
    return frames;
  }

  encode(frame: RemoteFrame): string {
    return `${stringifyRemoteFrame(frame)}\n`;
  }

  pendingBytes(): number {
    return Buffer.byteLength(this.buffer, "utf8");
  }
}
