import type { Readable, Writable } from "node:stream";
import type { HostHandshake } from "../shared/remote";
import { createHostRuntime } from "./serve-frames";

export async function serveStdio(opts: {
  stdin: Readable;
  stdout: Writable;
  handshake: HostHandshake;
}): Promise<void> {
  const runtime = createHostRuntime(opts.handshake);
  runtime.attach(opts.stdin, opts.stdout);
  await new Promise<void>((resolve) => {
    opts.stdin.on("end", () => resolve());
    opts.stdin.on("close", () => resolve());
  });
}
