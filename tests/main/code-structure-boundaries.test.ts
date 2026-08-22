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
    const src = sourceOf("src/shared/literature/ai-metadata.ts");
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
    const modes = sourceOf("src/shared/permissions/modes.ts");
    const session = sourceOf("src/shared/agent/session-agent.ts");
    expect(modes).toMatch(/export type PermissionMode =/);
    expect(session).not.toMatch(/export type PermissionMode =/);
    expect(session).toMatch(/export type \{ PermissionMode/);
  });
});

describe("code structure contracts (Phase 1)", () => {
  it("keeps conversation-reducer in shared without Pi or Electron", () => {
    const src = sourceOf("src/shared/agent/conversation-reducer.ts");
    expect(src).toMatch(/export function applyConversationEvent/);
    expect(src).not.toMatch(/from\s+["']electron["']/);
    expect(src).not.toMatch(/@earendil-works\/pi-/);
    expect(src).not.toMatch(/from\s+["'][^"']*\/renderer\//);
    expect(sourceOf("src/renderer/lib/chat/conversation-reducer.ts")).toMatch(
      /from\s+["'][^"']*shared\/agent\/conversation-reducer["']/,
    );
  });

  it("re-exports literature and git DTOs from electron.d.ts instead of redefining them", () => {
    const dts = sourceOf("src/renderer/types/electron.d.ts");
    expect(dts).not.toMatch(/export interface PaperExtractState \{/);
    expect(dts).not.toMatch(/export interface LiteraturePaper \{/);
    expect(dts).not.toMatch(/export interface WorktreeInfo \{/);
    expect(dts).not.toMatch(/export interface CitationHealthReport \{/);
    expect(dts).toContain('from "@shared/literature/paper-extract"');
    expect(dts).toContain('from "@shared/literature/paper"');
    expect(dts).toContain('from "@shared/git"');
    expect(dts).toContain('from "@shared/literature/citation-health-types"');
    expect(dts).toContain('from "@shared/literature/paper-citation-network"');
  });

  it("maps PaperRow to LiteraturePaper in one shared DTO", () => {
    const svc = sourceOf("src/main/literature/papers.ts");
    expect(svc).toMatch(/function mapPaperForRenderer\(row: PaperRow\): LiteraturePaper/);
    expect(sourceOf("src/shared/literature/paper.ts")).toMatch(/export interface LiteraturePaper/);
  });
});

describe("code structure shared packages (Phase 2)", () => {
  const domainDirs = [
    "agent",
    "permissions",
    "chat",
    "literature",
    "experiments",
    "research",
    "interaction",
    "workbench",
    "execution",
    "skills",
    "providers",
    "platform",
    "git",
  ];

  it("keeps required domain folders", () => {
    for (const dir of domainDirs) {
      expect(existsSync(join(REPO, "src/shared", dir)), dir).toBe(true);
    }
    expect(existsSync(join(REPO, "src/shared/index.ts"))).toBe(false);
  });

  it("keeps shared root free of TypeScript modules", () => {
    const root = join(REPO, "src/shared");
    const rootTs = readdirSync(root).filter((name) => name.endsWith(".ts"));
    expect(rootTs).toEqual([]);
  });

  it("keeps node:fs out of shared", () => {
    for (const file of walkTsFiles(join(REPO, "src/shared"))) {
      const rel = relative(REPO, file);
      expect(sourceOf(rel)).not.toMatch(/from\s+["']node:fs["']/);
    }
  });

  it("does not nest bibliographic-metadata under literature this phase", () => {
    expect(existsSync(join(REPO, "src/shared/bibliographic-metadata"))).toBe(true);
    expect(existsSync(join(REPO, "src/shared/literature/bibliographic-metadata"))).toBe(false);
  });

  it("keeps HTTP catalog lookup out of shared bibliographic-metadata", () => {
    expect(existsSync(join(REPO, "src/shared/bibliographic-metadata/catalog-fetch.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/shared/bibliographic-metadata/resolver.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/shared/bibliographic-metadata/sources/crossref.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/main/literature/catalog/catalog-fetch.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src/main/literature/catalog/resolver.ts"))).toBe(true);
    for (const file of walkTsFiles(join(REPO, "src/shared/bibliographic-metadata"))) {
      const src = sourceOf(relative(REPO, file));
      expect(src).not.toMatch(/from\s+["']node:http["']/);
      expect(src).not.toMatch(/catalogFetch/);
      expect(src).not.toMatch(/globalThis\.fetch/);
    }
  });
});

describe("code structure host port (Phase 3)", () => {
  it("keeps HostEvents free of Electron", () => {
    const src = sourceOf("src/main/app/event-sink.ts");
    expect(src).toMatch(/export type HostEvents/);
    expect(src).toMatch(/export function getHostEvents/);
    expect(src).toMatch(/export function setHostEventsForTest/);
    expect(src).not.toMatch(/from\s+["']electron["']/);
  });

  it("removes leftover services shims that already live in shared", () => {
    for (const rel of [
      "src/main/services/permission-modes.ts",
      "src/main/services/expert-permission-presets.ts",
      "src/main/services/tool-permission-registry.ts",
      "src/main/services/log-types.ts",
      "src/main/services/agent-subagents.ts",
      "src/main/services/context-constants.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("promotes literature to src/main/literature and drops Phase 3 shims", () => {
    for (const rel of [
      "src/main/literature/facade.ts",
      "src/main/literature/papers.ts",
      "src/main/literature/db.ts",
      "src/main/literature/enrich.ts",
      "src/main/literature/discovery/index.ts",
      "src/main/literature/extract/literature-extract-queue.ts",
      "src/main/literature/citation/citation-health.ts",
      "src/main/literature/pdf/literature-pdf-resolve.ts",
      "src/main/literature/pdf/url.ts",
      "src/main/literature/ai-metadata/literature-ai-metadata.ts",
      "src/main/literature/zotero/zotero-sync.ts",
      "src/main/app/literature-pdf-protocol.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/literature",
      "src/main/services/literature-service.ts",
      "src/main/services/literature-enrich.ts",
      "src/main/services/literature-broadcast.ts",
      "src/main/services/logger.ts",
      "src/main/services/zotero-sync.ts",
      "src/main/services/citation-health.ts",
      "src/main/services/literature-discovery/index.ts",
      "src/main/literature/pdf/literature-pdf-protocol.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
    expect(sourceOf("src/main/literature/papers.ts")).toMatch(
      /export function mapPaperForRenderer/,
    );
    expect(sourceOf("src/main/literature/facade.ts")).toMatch(
      /export \* from "\.\/papers"/,
    );
    expect(sourceOf("src/main/literature/bibliography.ts")).toMatch(
      /export async function bibliographyExportContent/,
    );
  });

  it("keeps main/lib free of services imports", () => {
    for (const file of walkTsFiles(join(REPO, "src/main/lib"))) {
      expect(
        importsFrom(file, /from\s+["'](?:\.\.\/)+services(?:\/|"|')/),
        relative(REPO, file),
      ).toEqual([]);
    }
  });

  it("promotes experiment to src/main/experiment and drops the log-service monolith", () => {
    for (const rel of [
      "src/main/experiment/facade.ts",
      "src/main/experiment/context.ts",
      "src/main/experiment/venv.ts",
      "src/main/experiment/crud.ts",
      "src/main/experiment/runs.ts",
      "src/main/experiment/experiment-run-executor.ts",
      "src/main/experiment/provenance-service.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/experiment-log-service.ts",
      "src/main/services/experiment-run-executor.ts",
      "src/main/services/experiment-tool-dispatch.ts",
      "src/main/services/provenance-service.ts",
      "src/main/experiment/experiment-log-service.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("promotes compile to src/main/compile and drops the compiler monolith name", () => {
    for (const rel of [
      "src/main/compile/facade.ts",
      "src/main/compile/orchestrate.ts",
      "src/main/compile/log.ts",
      "src/main/compile/tectonic-binary.ts",
      "src/main/compile/tectonic-daemon.ts",
      "src/main/compile/latex-service.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/compiler.ts",
      "src/main/services/latex-service.ts",
      "src/main/services/tectonic-daemon.ts",
      "src/main/compile/compiler.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("promotes terminal and project out of services", () => {
    for (const rel of [
      "src/main/terminal/terminal.ts",
      "src/main/terminal/ai-pty.ts",
      "src/main/terminal/execution-registry.ts",
      "src/main/project/filesystem.ts",
      "src/main/project/workspace-config.ts",
      "src/main/project/project-lifecycle-authority.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/terminal.ts",
      "src/main/services/ai-pty.ts",
      "src/main/services/filesystem.ts",
      "src/main/services/workspace-config.ts",
      "src/main/services/project-lifecycle-authority.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("keeps the terminal and project domains free of Electron, ipc, and agent", () => {
    for (const dir of ["src/main/terminal", "src/main/project"]) {
      for (const file of walkTsFiles(join(REPO, dir))) {
        expect(sourceOf(relative(REPO, file)), relative(REPO, file)).not.toMatch(
          /from\s+["']electron["']/,
        );
        expect(importsFrom(file, /from\s+["'](?:\.\.\/)+ipc\//)).toEqual([]);
        expect(importsFrom(file, /from\s+["'](?:\.\.\/)+agent\//)).toEqual([]);
      }
    }
  });

  it("promotes git to src/main/git and drops the services monolith", () => {
    for (const rel of [
      "src/main/git/facade.ts",
      "src/main/git/exec.ts",
      "src/main/git/status.ts",
      "src/main/git/stage.ts",
      "src/main/git/branch.ts",
      "src/main/git/log.ts",
      "src/main/git/merge.ts",
      "src/main/git/commit.ts",
      "src/main/git/worktree.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/git.ts",
      "src/main/services/worktree.ts",
      "src/main/git/git.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("keeps the git domain free of Electron, ipc, and agent", () => {
    for (const file of walkTsFiles(join(REPO, "src/main/git"))) {
      expect(sourceOf(relative(REPO, file)), relative(REPO, file)).not.toMatch(
        /from\s+["']electron["']/,
      );
      expect(importsFrom(file, /from\s+["'](?:\.\.\/)+ipc\//)).toEqual([]);
      expect(importsFrom(file, /from\s+["'](?:\.\.\/)+agent\//)).toEqual([]);
    }
  });

  it("keeps the compile domain free of Electron, ipc, and agent", () => {
    for (const file of walkTsFiles(join(REPO, "src/main/compile"))) {
      if (file.endsWith(".mjs")) continue;
      expect(sourceOf(relative(REPO, file)), relative(REPO, file)).not.toMatch(
        /from\s+["']electron["']/,
      );
      expect(importsFrom(file, /from\s+["'](?:\.\.\/)+ipc\//)).toEqual([]);
      expect(importsFrom(file, /from\s+["'](?:\.\.\/)+agent\//)).toEqual([]);
    }
  });

  it("keeps the experiment domain free of Electron, ipc, and agent", () => {
    for (const file of walkTsFiles(join(REPO, "src/main/experiment"))) {
      expect(sourceOf(relative(REPO, file)), relative(REPO, file)).not.toMatch(
        /from\s+["']electron["']/,
      );
      expect(importsFrom(file, /from\s+["'][^"']*\/ipc\//)).toEqual([]);
      expect(importsFrom(file, /from\s+["'][^"']*\/agent\//)).toEqual([]);
    }
  });

  it("keeps the literature domain free of Electron, ipc, and agent", () => {
    for (const file of walkTsFiles(join(REPO, "src/main/literature"))) {
      const src = sourceOf(relative(REPO, file));
      expect(src, relative(REPO, file)).not.toMatch(/from\s+["']electron["']/);
      expect(importsFrom(file, /from\s+["'][^"']*\/ipc\//)).toEqual([]);
      expect(importsFrom(file, /from\s+["'][^"']*\/agent\//)).toEqual([]);
    }
  });

  it("promotes session, skills, research, and interaction out of services", () => {
    for (const rel of [
      "src/main/session/chat-session-registry.ts",
      "src/main/session/project-chat-prewarm.ts",
      "src/main/session/prompt-file-attachments.ts",
      "src/main/skills/skills-sync.ts",
      "src/main/skills/skills-registry.ts",
      "src/main/skills/project-skills-refresh.ts",
      "src/main/research/research-plan-service.ts",
      "src/main/research/research-brief-service.ts",
      "src/main/interaction/interaction-store.ts",
      "src/main/interaction/interaction-ui-events.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/chat-session-registry.ts",
      "src/main/services/project-chat-prewarm.ts",
      "src/main/services/prompt-file-attachments.ts",
      "src/main/services/skills-sync.ts",
      "src/main/services/skills-registry.ts",
      "src/main/services/project-skills-refresh.ts",
      "src/main/services/research-plan-service.ts",
      "src/main/services/research-brief-service.ts",
      "src/main/services/interaction-store.ts",
      "src/main/services/interaction-ui-events.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("keeps session, skills, research, and interaction free of Electron, ipc, and agent", () => {
    for (const dir of [
      "src/main/session",
      "src/main/skills",
      "src/main/research",
      "src/main/interaction",
    ]) {
      for (const file of walkTsFiles(join(REPO, dir))) {
        expect(sourceOf(relative(REPO, file)), relative(REPO, file)).not.toMatch(
          /from\s+["']electron["']/,
        );
        expect(importsFrom(file, /from\s+["'](?:\.\.\/)+ipc\//)).toEqual([]);
        expect(importsFrom(file, /from\s+["'](?:\.\.\/)+agent\//)).toEqual([]);
      }
    }
  });
});
