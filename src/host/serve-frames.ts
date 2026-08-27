import type { Readable, Writable } from "node:stream";
import {
  parseRemoteFrame,
  stringifyRemoteFrame,
  type HostHandshake,
  type RemoteFrame,
} from "../shared/remote";
import { runDoctor } from "./doctor";
import { ensureMyContentTeam } from "../main/teams/my-content";
import { enableHostLicenseSessionMode } from "../main/teams/teams-license";
import { setHostEvents } from "../main/app/event-sink";
import { createHostContext, dispatchHostMethod, type HostHandlerContext } from "./handler-registry";
import { installHostModelProxyFetch } from "./model-proxy-transport";

const MAX_BUFFER = 8 * 1024 * 1024;

export interface HostRuntime {
  ctx: HostHandlerContext;
  attach(stdin: Readable, stdout: Writable): () => void;
}

/** One Host process, one context. Attach/detach the current control-plane stream. */
export function createHostRuntime(handshake: HostHandshake): HostRuntime {
  enableHostLicenseSessionMode();
  ensureMyContentTeam();
  const ctx = createHostContext();
  let write: (frame: RemoteFrame) => void = () => undefined;
  ctx.emit = (channel, payload) => {
    write({ kind: "event", channel, payload });
  };
  setHostEvents({
    broadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
    sendToOriginThenBroadcast(channel, payload) {
      ctx.emit(channel, payload);
    },
  });
  installHostModelProxyFetch(ctx.emit);

  const handle = async (frame: RemoteFrame) => {
    if (frame.kind !== "req") return;
    try {
      if (frame.method === "host.handshake") {
        const incoming = frame.params && typeof frame.params === "object" && !Array.isArray(frame.params)
          ? String((frame.params as { connectionId?: unknown }).connectionId ?? "").trim()
          : "";
        if (incoming) ctx.ownerConnectionId = incoming;
        write({
          kind: "res",
          id: frame.id,
          ok: true,
          result: {
            ...handshake,
            features: Array.from(new Set([
              ...handshake.features,
              "fs",
              "terminal",
              "control",
              "agent",
              "literature",
              "experiment",
              "compile",
              "research",
              "interaction",
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

  return {
    ctx,
    attach(stdin, stdout) {
      write = (frame) => {
        stdout.write(`${stringifyRemoteFrame(frame)}\n`);
      };
      ctx.emit = (channel, payload) => {
        write({ kind: "event", channel, payload });
      };
      let buffer = "";
      const onData = (chunk: string | Buffer) => {
        buffer += String(chunk);
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
      };
      stdin.setEncoding("utf8");
      stdin.on("data", onData);
      return () => {
        stdin.off("data", onData);
        write = () => undefined;
      };
    },
  };
}
