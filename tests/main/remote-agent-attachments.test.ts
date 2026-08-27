import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REMOTE_LITERATURE_PDF_MAX_BYTES,
  REMOTE_UPLOAD_MAX_BYTES,
  stageLaptopAttachmentsForRemote,
  stageLaptopPdfForRemote,
} from "../../src/main/remote/agent-attachments";

describe("remote send attachments", () => {
  it("uploads a small laptop file and rewrites the path into the remote project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-attach-"));
    const local = join(dir, "note.txt");
    writeFileSync(local, "hello");
    const written: Array<{ path: string; bytes: string }> = [];
    const staged = await stageLaptopAttachmentsForRemote({
      projectRoot: "remote://lab/home/ubuntu/paper",
      turnId: "t1",
      attachments: [{ name: "note.txt", kind: "file", path: local }],
    }, async (absPath, bytes) => {
      written.push({ path: absPath, bytes: bytes.toString("utf8") });
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(written).toEqual([{
      path: "/home/ubuntu/paper/.workbench/uploads/t1/note.txt",
      bytes: "hello",
    }]);
    expect(staged.input.attachments).toEqual([{
      name: "note.txt",
      kind: "file",
      path: "/home/ubuntu/paper/.workbench/uploads/t1/note.txt",
    }]);
  });

  it("rejects files larger than 5MB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-attach-big-"));
    const local = join(dir, "big.bin");
    writeFileSync(local, Buffer.alloc(REMOTE_UPLOAD_MAX_BYTES + 1));
    const staged = await stageLaptopAttachmentsForRemote({
      projectRoot: "remote://lab/home/ubuntu/paper",
      turnId: "t1",
      attachments: [{ name: "big.bin", kind: "file", path: local }],
    }, async () => undefined);
    expect(staged).toEqual({ ok: false, error: "remote_attachment_too_large" });
  });
});

describe("remote literature PDF upload", () => {
  it("copies a laptop PDF into the remote paper uploads folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-lit-pdf-"));
    const local = join(dir, "paper.pdf");
    writeFileSync(local, "%PDF-1.4");
    const written: Array<{ path: string; bytes: string }> = [];
    const staged = await stageLaptopPdfForRemote(
      "remote://lab/home/ubuntu/paper",
      local,
      async (absPath, bytes) => {
        written.push({ path: absPath, bytes: bytes.toString("utf8") });
      },
    );
    expect(staged).toEqual({
      ok: true,
      pdfPath: "/home/ubuntu/paper/.workbench/uploads/literature/paper.pdf",
    });
    expect(written).toEqual([{
      path: "/home/ubuntu/paper/.workbench/uploads/literature/paper.pdf",
      bytes: "%PDF-1.4",
    }]);
  });

  it("leaves a server path unchanged", async () => {
    const staged = await stageLaptopPdfForRemote(
      "remote://lab/home/ubuntu/paper",
      "/home/ubuntu/paper/.workbench/uploads/literature/paper.pdf",
      async () => {
        throw new Error("should not upload");
      },
    );
    expect(staged).toEqual({
      ok: true,
      pdfPath: "/home/ubuntu/paper/.workbench/uploads/literature/paper.pdf",
    });
  });

  it("rejects PDFs larger than the literature cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-lit-pdf-big-"));
    const local = join(dir, "huge.pdf");
    writeFileSync(local, Buffer.alloc(REMOTE_LITERATURE_PDF_MAX_BYTES + 1));
    const staged = await stageLaptopPdfForRemote(
      "remote://lab/home/ubuntu/paper",
      local,
      async () => undefined,
    );
    expect(staged).toEqual({ ok: false, error: "remote_literature_pdf_too_large" });
  });
});
