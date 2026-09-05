import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVtCrlfTranslator, ensureVtCrlf } from "../../src/host/terminal-pty";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";

describe("VT CRLF translation", () => {
  it("turns a lone LF into CRLF so xterm returns to column 0", () => {
    expect(ensureVtCrlf("hello\nworld\n")).toBe("hello\r\nworld\r\n");
  });

  it("does not double a CR that is already there", () => {
    expect(ensureVtCrlf("hello\r\nworld\r\n")).toBe("hello\r\nworld\r\n");
  });

  it("keeps CR-only progress-bar rewrites", () => {
    expect(ensureVtCrlf("aaa\rbbb")).toBe("aaa\rbbb");
  });

  it("stitches a CR/LF pair split across chunks", () => {
    const translate = createVtCrlfTranslator();
    expect(translate("hello\r")).toBe("hello\r");
    expect(translate("\nworld\n")).toBe("\nworld\r\n");
  });
});

describe("host terminal stream", () => {
  // Spawns a real PTY (darwin-relay: perl helper + shell). Under full-suite
  // parallel load the relay handshake alone can take seconds, so give the
  // whole test a generous budget instead of the 5s default.
  it(
    "emits CRLF so a pipe-backed shell cannot staircase in xterm",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "prism-host-crlf-"));
      const ctx = createHostContext();
      ctx.remoteRoot = root;
      const chunks: string[] = [];
      ctx.emit = (channel, payload) => {
        if (channel === "terminal:data") {
          chunks.push(String((payload as { data?: string }).data ?? ""));
        }
      };
      await dispatchHostMethod("terminal:create", { sessionId: "s-crlf", tabId: "t-crlf" }, ctx);
      await dispatchHostMethod("terminal:write", { sessionId: "s-crlf", data: "printf 'a\\nb\\n'\n" }, ctx);
      // A real PTY echoes the typed command back, so "contains a and b" is
      // satisfied by the echo alone — poll for the actual CRLF output instead.
      const deadline = Date.now() + 20_000;
      let joined = "";
      while (Date.now() < deadline) {
        joined = chunks.join("");
        if (/a\r\nb\r\n/.test(joined)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await dispatchHostMethod("terminal:destroy", { sessionId: "s-crlf" }, ctx);
      expect(joined).toMatch(/a\r\nb\r\n/);
    },
    30_000,
  );
});

describe("xterm display contract", () => {
  it("asks xterm to treat LF as newline+return", () => {
    const view = readFileSync(
      join(__dirname, "../../src/renderer/modes/terminal-mode/terminal-view.tsx"),
      "utf8",
    );
    expect(view).toMatch(/convertEol:\s*true/);
  });
});
