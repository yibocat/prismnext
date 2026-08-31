import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { parseListenBind, startHostListenServer } from "../../src/host/serve-listen";
import {
  parseRemoteFrame,
  stringifyRemoteFrame,
  type HostHandshake,
  type RemoteFrame,
} from "../../src/shared/remote";

const handshake: HostHandshake = {
  protocolRev: 1,
  desktopVersion: "0.9.0",
  payloadSha256: "listen-unit",
  appHome: "/tmp/.prismnext",
  hostRoot: "/tmp/.prismnext-host",
  features: ["control"],
};

async function connectPort(port: number): Promise<Socket> {
  const socket = createConnection({ host: "127.0.0.1", port });
  await once(socket, "connect");
  return socket;
}

class LineClient {
  private buffer = "";
  private readonly queued: RemoteFrame[] = [];
  private readonly waiters: Array<(frame: RemoteFrame) => void> = [];

  constructor(private readonly socket: Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      while (true) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const frame = parseRemoteFrame(line);
        const waiter = this.waiters.shift();
        if (waiter) waiter(frame);
        else this.queued.push(frame);
      }
    });
  }

  private next(): Promise<RemoteFrame> {
    const queued = this.queued.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async rpc(method: string, params: unknown): Promise<unknown> {
    const id = randomUUID();
    this.socket.write(`${stringifyRemoteFrame({ kind: "req", id, method, params })}\n`);
    for (;;) {
      const frame = await this.next();
      if (frame.kind === "res" && frame.id === id) {
        if (!frame.ok) throw new Error(frame.error.message);
        return frame.result;
      }
    }
  }

  async waitEvent(channel: string): Promise<unknown> {
    for (;;) {
      const frame = await this.next();
      if (frame.kind === "event" && frame.channel === channel) return frame.payload;
    }
  }
}

describe("parseListenBind", () => {
  it("accepts localhost binds and rejects anything else", () => {
    expect(parseListenBind("127.0.0.1:0")).toEqual({ host: "127.0.0.1", port: 0 });
    expect(parseListenBind("localhost:8123")).toEqual({ host: "127.0.0.1", port: 8123 });
    expect(parseListenBind("0.0.0.0:8123")).toBeNull();
    expect(parseListenBind("[::]:8123")).toBeNull();
    expect(parseListenBind("192.168.1.9:8123")).toBeNull();
    expect(parseListenBind("127.0.0.1")).toBeNull();
  });
});

describe("startHostListenServer", () => {
  it("keeps project bind across socket drop via host.reattach", async () => {
    const paper = mkdtempSync(join(tmpdir(), "prism-listen-paper-"));
    const started = await startHostListenServer({ handshake, bind: "127.0.0.1:0" });
    try {
      const first = new LineClient(await connectPort(started.port));
      await first.rpc("host.handshake", { connectionId: "conn_a" });
      const opened = await first.rpc("project.open", { remoteRoot: paper }) as {
        projectId: string;
        remoteRoot: string;
      };
      expect(opened.remoteRoot).toBe(paper);
      first.socket.destroy();
      await once(first.socket, "close");

      const second = new LineClient(await connectPort(started.port));
      const reattached = await second.rpc("host.reattach", { connectionId: "conn_a" }) as {
        remoteRoot: string | null;
        projectId: string | null;
      };
      expect(reattached.remoteRoot).toBe(paper);
      expect(reattached.projectId).toBe(opened.projectId);
      second.socket.destroy();
    } finally {
      await started.close();
    }
  });

  it("ignores a TCP probe that never sends a frame", async () => {
    const started = await startHostListenServer({ handshake, bind: "127.0.0.1:0" });
    try {
      const first = new LineClient(await connectPort(started.port));
      await first.rpc("host.handshake", { connectionId: "conn_keep" });
      const probe = await connectPort(started.port);
      probe.end();
      await once(probe, "close");
      await expect(first.rpc("host.doctor", {})).resolves.toMatchObject({ ok: expect.anything() });
      first.socket.destroy();
    } finally {
      await started.close();
    }
  });

  it("displaces the first socket when a second client sends a frame", async () => {
    const started = await startHostListenServer({ handshake, bind: "127.0.0.1:0" });
    try {
      const first = new LineClient(await connectPort(started.port));
      await first.rpc("host.handshake", { connectionId: "conn_one" });
      const displaced = first.waitEvent("remote:displaced");
      const second = new LineClient(await connectPort(started.port));
      const handshake = second.rpc("host.handshake", { connectionId: "conn_two" });
      await expect(displaced).resolves.toBeTruthy();
      await handshake;
      await expect(second.rpc("host.reattach", { connectionId: "conn_one" })).rejects.toThrow(/took over/i);
      const mine = await second.rpc("host.reattach", { connectionId: "conn_two" }) as {
        ownerConnectionId?: string;
      };
      expect(mine.ownerConnectionId).toBe("conn_two");
      first.socket.destroy();
      second.socket.destroy();
    } finally {
      await started.close();
    }
  });

  it("refuses a non-localhost bind", async () => {
    await expect(startHostListenServer({ handshake, bind: "0.0.0.0:9" })).rejects.toThrow(/127\.0\.0\.1/);
  });
});
