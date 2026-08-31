/**
 * stdio JSON-RPC wrapper around `tinymist lsp`.
 * No Electron. Session lifecycle lives in tinymist-session.ts.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  createMessageConnection,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import { resolveTinymistConfigurationItems } from "../../shared/typst/lsp";
import { createLogger } from "../app/logger";

const log = createLogger("tinymist-rpc", "compile");

export type TinymistRpc = {
  connection: MessageConnection;
  child: ChildProcess;
  dispose(): Promise<void>;
};

export function spawnTinymistLsp(binaryPath: string, cwd?: string): TinymistRpc {
  const child = spawn(binaryPath, ["lsp"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!child.stdin || !child.stdout) {
    child.kill();
    throw new Error("tinymist lsp stdio missing");
  }
  child.stderr?.on("data", (buf: Buffer) => {
    const text = buf.toString("utf8").trim();
    if (text) log.info(text);
  });
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    stream?.on("error", () => undefined);
  }
  const connection = createMessageConnection(child.stdout, child.stdin);
  connection.onError(() => undefined);
  connection.onRequest((method, params) => {
    if (method === "workspace/configuration") return resolveTinymistConfigurationItems(params);
    if (method === "client/registerCapability") return null;
    if (method === "client/unregisterCapability") return null;
    if (method === "window/workDoneProgress/create") return null;
    log.debug("unhandled LSP request", { method });
    return null;
  });
  connection.listen();
  return {
    connection,
    child,
    async dispose() {
      try {
        connection.dispose();
      } catch {
        // already closed
      }
      if (!child.killed && child.exitCode === null) {
        child.kill();
      }
    },
  };
}
