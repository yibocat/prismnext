import type { Readable, Writable } from "node:stream";
import {
  parseRemoteFrame,
  stringifyRemoteFrame,
  type HostHandshake,
  type RemoteFrame,
} from "../shared/remote";
import { runDoctor } from "./doctor";
import { createHostContext, dispatchHostMethod } from "./handler-registry";
import { installHostModelProxyFetch } from "./model-proxy-transport";

const MAX_BUFFER = 8 * 1024 * 1024;

export async function serveStdio(opts: {
  stdin: Readable;
  stdout: Writable;
  handshake: HostHandshake;
}): Promise<void> {
  const ctx = createHostContext();
  const write = (frame: RemoteFrame) => {
    opts.stdout.write(`${stringifyRemoteFrame(frame)}\n`);
  };
  ctx.emit = (channel, payload) => {
    write({ kind: "event", channel, payload });
  };
  installHostModelProxyFetch(ctx.emit);

  const handle = async (frame: RemoteFrame) => {
    if (frame.kind !== "req") return;
    try {
      if (frame.method === "host.handshake") {
        write({
          kind: "res",
          id: frame.id,
          ok: true,
          result: {
            ...opts.handshake,
            features: Array.from(new Set([
              ...opts.handshake.features,
              "fs",
              "terminal",
              "control",
              "agent",
              "literature",
              "experiment",
              "compile",
            ])),
          },
        });
        return;
      }
      if (frame.method === "host.doctor") {
        write({ kind: "res", id: frame.id, ok: true, result: await runDoctor() });
        return;
      }
      const result = await dispatchHostMethod(frame.method, frame.params, ctx);
      write({ kind: "res", id: frame.id, ok: true, result });
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "protocol";
      write({
        kind: "res",
        id: frame.id,
        ok: false,
        error: { code, message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  let buffer = "";
  opts.stdin.setEncoding("utf8");
  opts.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_BUFFER) {
      buffer = "";
      return;
    }
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        void handle(parseRemoteFrame(line));
      } catch (err) {
        write({
          kind: "event",
          channel: "remote:log",
          payload: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  });

  await new Promise<void>((resolve) => {
    opts.stdin.on("end", () => resolve());
    opts.stdin.on("close", () => resolve());
  });
}
