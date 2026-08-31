"use strict";

/**
 * One-shot protocol probe against the pinned tinymist binary.
 * Not used in production. Output is copied into
 * docs-private/specs/2026-08-31-tinymist-protocol-appendix.md
 */

const { spawn } = require("node:child_process");
const { existsSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { createMessageConnection } = require("vscode-jsonrpc/node");

const BIN = join(__dirname, "../../bin/tinymist/darwin-arm64/tinymist");

async function main() {
  if (!existsSync(BIN)) {
    throw new Error(`missing ${BIN}`);
  }
  const dir = mkdtempSync(join(tmpdir(), "prism-tinymist-spike-"));
  const typ = join(dir, "hello.typ");
  writeFileSync(typ, "#set page(width: 8cm, height: 4cm)\nHello, PrismNext.\n");

  const child = spawn(BIN, ["lsp"], { cwd: dir, stdio: ["pipe", "pipe", "pipe"] });
  child.stderr.on("data", (buf) => process.stderr.write(buf));
  const conn = createMessageConnection(child.stdout, child.stdin);
  conn.onRequest((method) => {
    console.error(`server request: ${method}`);
    if (method === "workspace/configuration") return [{}];
    return null;
  });
  conn.listen();

  const rootUri = pathToFileURL(dir).href;
  const initializeParams = {
    processId: process.pid,
    rootUri,
    capabilities: {
      workspace: { executeCommand: { dynamicRegistration: false } },
      textDocument: {
        synchronization: { didSave: true },
        publishDiagnostics: {},
      },
    },
    initializationOptions: {
      exportPdf: "never",
      formatterMode: "disable",
      preview: { cursorIndicator: false },
    },
    workspaceFolders: [{ uri: rootUri, name: "project" }],
  };
  console.log("=== INITIALIZE PARAMS ===");
  console.log(JSON.stringify(initializeParams, null, 2));
  const init = await conn.sendRequest("initialize", initializeParams);
  console.log("=== INITIALIZE RESULT ===");
  console.log(JSON.stringify(init, null, 2));
  conn.sendNotification("initialized", {});

  const didOpen = {
    textDocument: {
      uri: pathToFileURL(typ).href,
      languageId: "typst",
      version: 1,
      text: "#set page(width: 8cm, height: 4cm)\nHello, PrismNext.\n",
    },
  };
  console.log("=== DID OPEN ===");
  console.log(JSON.stringify(didOpen, null, 2));
  conn.sendNotification("textDocument/didOpen", didOpen);
  await new Promise((r) => setTimeout(r, 800));

  const previewArgs = [
    "--task-id",
    "spike1",
    "--data-plane-host",
    "127.0.0.1:0",
    "--invert-colors",
    "never",
    "--no-open",
    typ,
  ];
  const startReq = {
    command: "tinymist.doStartPreview",
    arguments: [previewArgs],
  };
  console.log("=== START PREVIEW REQUEST ===");
  console.log(JSON.stringify(startReq, null, 2));
  const preview = await conn.sendRequest("workspace/executeCommand", startReq);
  console.log("=== START PREVIEW RESULT ===");
  console.log(JSON.stringify(preview, null, 2));

  const port = preview && preview.staticServerPort;
  if (typeof port !== "number") {
    throw new Error("no staticServerPort in preview result");
  }
  const url = `http://127.0.0.1:${port}/`;
  const res = await fetch(url);
  const html = await res.text();
  console.log("=== HTTP ===");
  console.log(JSON.stringify({ url, status: res.status, contentType: res.headers.get("content-type") }, null, 2));
  console.log("=== HTML PREFIX ===");
  console.log(html.slice(0, 500));

  const killReq = { command: "tinymist.doKillPreview", arguments: ["spike1"] };
  console.log("=== KILL PREVIEW REQUEST ===");
  console.log(JSON.stringify(killReq, null, 2));
  const killed = await conn.sendRequest("workspace/executeCommand", killReq);
  console.log("=== KILL PREVIEW RESULT ===");
  console.log(JSON.stringify(killed, null, 2));

  try {
    await conn.sendRequest("shutdown");
    conn.sendNotification("exit");
  } catch {
    // ignore
  }
  conn.dispose();
  if (!child.killed) child.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
