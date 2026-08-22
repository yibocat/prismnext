import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../..");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walkTsFiles(path));
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

function sourceOf(rel: string): string {
  return readFileSync(join(REPO, rel), "utf-8");
}

function importsFrom(file: string, pattern: RegExp): string[] {
  const src = readFileSync(file, "utf-8");
  const hits: string[] = [];
  for (const line of src.split("\n")) {
    if (!/\bfrom\s+["']/.test(line) && !/\bimport\s*\(/.test(line)) continue;
    if (pattern.test(line)) hits.push(line.trim());
  }
  return hits;
}

describe("code structure layer boundaries (Phase 0)", () => {
  it("resolves @shared only to src/shared", () => {
    const rendererTs = sourceOf("tsconfig.json");
    const nodeTs = sourceOf("tsconfig.node.json");
    const plugin = sourceOf("scripts/vite-shared-alias-plugin.ts");
    expect(rendererTs).toContain('"@shared/*": ["./src/shared/*"]');
    expect(rendererTs).not.toContain("./src/main/services/*");
    expect(nodeTs).toContain('"@shared/*": ["./src/shared/*"]');
    expect(nodeTs).not.toContain("./src/main/services/*");
    expect(plugin).toContain('path.resolve(rootDir, "src/shared")');
    expect(plugin).not.toContain("src/main/services");
  });

  it("keeps shared free of main and renderer imports", () => {
    const files = walkTsFiles(join(REPO, "src/shared"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const rel = relative(REPO, file);
      expect(importsFrom(file, /from\s+["'][^"']*\/main\//), rel).toEqual([]);
      expect(importsFrom(file, /from\s+["'][^"']*\/renderer\//), rel).toEqual([]);
    }
  });

  it("keeps shared literature-ai-metadata free of node:crypto", () => {
    const src = sourceOf("src/shared/literature-ai-metadata.ts");
    expect(src).not.toMatch(/node:crypto/);
    expect(src).not.toMatch(/aiMetadataFingerprint/);
  });

  it("keeps renderer free of relative main imports", () => {
    const files = walkTsFiles(join(REPO, "src/renderer"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const rel = relative(REPO, file);
      expect(importsFrom(file, /from\s+["'][^"']*\/main\//), rel).toEqual([]);
    }
  });

  it("keeps main and preload free of renderer imports", () => {
    for (const dir of ["src/main", "src/preload"]) {
      const files = walkTsFiles(join(REPO, dir));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const rel = relative(REPO, file);
        expect(importsFrom(file, /from\s+["'][^"']*\/renderer\//), rel).toEqual([]);
      }
    }
  });

  it("defines PermissionMode in one shared module", () => {
    const modes = sourceOf("src/shared/permission-modes.ts");
    const session = sourceOf("src/shared/session-agent.ts");
    expect(modes).toMatch(/export type PermissionMode =/);
    expect(session).not.toMatch(/export type PermissionMode =/);
    expect(session).toMatch(/export type \{ PermissionMode/);
  });
});

describe("code structure contracts (Phase 1)", () => {
  it("keeps conversation-reducer in shared without Pi or Electron", () => {
    const src = sourceOf("src/shared/conversation-reducer.ts");
    expect(src).toMatch(/export function applyConversationEvent/);
    expect(src).not.toMatch(/from\s+["']electron["']/);
    expect(src).not.toMatch(/@earendil-works\/pi-/);
    expect(src).not.toMatch(/from\s+["'][^"']*\/renderer\//);
    expect(sourceOf("src/renderer/lib/chat/conversation-reducer.ts")).toMatch(
      /from\s+["'][^"']*shared\/conversation-reducer["']/,
    );
  });

  it("re-exports literature and git DTOs from electron.d.ts instead of redefining them", () => {
    const dts = sourceOf("src/renderer/types/electron.d.ts");
    expect(dts).not.toMatch(/export interface PaperExtractState \{/);
    expect(dts).not.toMatch(/export interface LiteraturePaper \{/);
    expect(dts).not.toMatch(/export interface WorktreeInfo \{/);
    expect(dts).not.toMatch(/export interface CitationHealthReport \{/);
    expect(dts).toContain('from "@shared/paper-extract"');
    expect(dts).toContain('from "@shared/literature-paper"');
    expect(dts).toContain('from "@shared/git"');
    expect(dts).toContain('from "@shared/citation-health-types"');
    expect(dts).toContain('from "@shared/paper-citation-network"');
  });

  it("maps PaperRow to LiteraturePaper in one shared DTO", () => {
    const svc = sourceOf("src/main/services/literature-service.ts");
    expect(svc).toMatch(/function mapPaperForRenderer\(row: PaperRow\): LiteraturePaper/);
    expect(sourceOf("src/shared/literature-paper.ts")).toMatch(/export interface LiteraturePaper/);
  });
});
