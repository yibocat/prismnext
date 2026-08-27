import { createServer, type Socket } from "node:net";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { HostHandshake } from "../shared/remote";
import { createHostRuntime, type HostRuntime } from "./serve-frames";

export function parseListenBind(value: string): { host: string; port: number } | null {
  const raw = value.trim();
  const match = raw.match(/^(127\.0\.0\.1|localhost):(\d+)$/i);
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
  return { host: "127.0.0.1", port };
}

export async function startHostListenServer(opts: {
  handshake: HostHandshake;
  bind: string;
  listenFile?: string;
}): Promise<{ port: number; close: () => Promise<void>; runtime: HostRuntime }> {
  const parsed = parseListenBind(opts.bind);
  if (!parsed) {
    throw new Error("Host listen bind must be 127.0.0.1:<port> (localhost only).");
  }
  const runtime = createHostRuntime(opts.handshake);
  let active: Socket | null = null;
  let detach: () => void = () => undefined;

  const server = createServer((socket) => {
    const takeOver = (first: Buffer | string) => {
      if (active && !active.destroyed && active !== socket) {
        try {
          active.write(`${JSON.stringify({
            kind: "event",
            channel: "remote:displaced",
            payload: { message: "Another connection took over this Host." },
          })}\n`);
        } catch {
          // old socket already gone
        }
        active.end();
      }
      detach();
      active = socket;
      if (typeof first === "string") socket.unshift(Buffer.from(first));
      else socket.unshift(first);
      detach = runtime.attach(socket, socket);
    };
    const onFirstData = (chunk: Buffer | string) => {
      socket.off("data", onFirstData);
      if ((typeof chunk === "string" ? chunk.length : chunk.length) === 0) {
        socket.once("data", onFirstData);
        return;
      }
      takeOver(chunk);
    };
    socket.on("data", onFirstData);
    socket.on("close", () => {
      socket.off("data", onFirstData);
      if (active === socket) {
        detach();
        active = null;
      }
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(parsed.port, parsed.host, () => {
      const addr = server.address();
      resolve(addr && typeof addr === "object" ? addr.port : parsed.port);
    });
  });

  if (opts.listenFile) {
    mkdirSync(dirname(opts.listenFile), { recursive: true });
    writeFileSync(
      opts.listenFile,
      `${JSON.stringify({ port, pid: process.pid, bind: "127.0.0.1" })}\n`,
      "utf8",
    );
  }

  return {
    port,
    runtime,
    close: () => new Promise((resolve) => {
      active?.destroy();
      server.close(() => resolve());
    }),
  };
}

export async function serveListen(opts: {
  handshake: HostHandshake;
  bind: string;
  listenFile?: string;
}): Promise<void> {
  const started = await startHostListenServer(opts);
  process.stderr.write(`prismnext-host listen 127.0.0.1:${started.port}\n`);
  await new Promise<void>(() => {
    // Stay up until the process is signaled. Sockets may attach and detach.
  });
}
