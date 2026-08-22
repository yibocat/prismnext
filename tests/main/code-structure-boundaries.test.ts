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
    expect(existsSync(join(REPO, "src/main/literature/host.ts"))).toBe(true);
    expect(sourceOf("src/main/literature/facade.ts")).not.toMatch(
      /export \* from "\.\/host"/,
    );
  });

  it("keeps literature ipc as host + dialog forwarding", () => {
    for (const rel of [
      "src/main/ipc/literature.ts",
      "src/main/ipc/literature-extract.ts",
      "src/main/ipc/zotero.ts",
      "src/main/ipc/bibliography.ts",
    ]) {
      const src = sourceOf(rel);
      expect(src, rel).not.toMatch(/from\s+["']\.\.\/services/);
      expect(
        importsFrom(join(REPO, rel), /from\s+["']\.\.\/literature\/(?!host)/),
        rel,
      ).toEqual([]);
      expect(src, rel).not.toMatch(/zotero-sync|paper-extract-db|literature-enrich/);
    }
    expect(sourceOf("src/main/ipc/literature.ts")).toMatch(
      /from\s+["']\.\.\/literature\/host["']/,
    );
  });

  it("splits preload by domain and keeps the electronAPI method names", () => {
    const index = sourceOf("src/preload/index.ts");
    expect(index).toMatch(/exposeInMainWorld\(\s*["']electronAPI["']/);
    expect(index).not.toMatch(/ipcRenderer\.invoke/);
    expect(index).not.toMatch(/ipcRenderer\.on/);

    for (const rel of [
      "src/preload/fs.ts",
      "src/preload/dialog.ts",
      "src/preload/project.ts",
      "src/preload/template.ts",
      "src/preload/literature.ts",
      "src/preload/experiment.ts",
      "src/preload/git.ts",
      "src/preload/agent.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }

    const keys: string[] = [];
    for (const file of walkTsFiles(join(REPO, "src/preload"))) {
      if (file.endsWith("/index.ts")) continue;
      const src = readFileSync(file, "utf-8");
      keys.push(...[...src.matchAll(/^\t([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1]));
    }
    expect(keys).toHaveLength(392);
    expect(new Set(keys).size).toBe(392);
    expect(keys).toEqual(expect.arrayContaining([
      "fsScan",
      "dialogOpenFolder",
      "projectCreate",
      "templateApply",
      "literatureList",
      "experimentList",
      "gitStatus",
      "agentSend",
      "templateBackup",
      "updateCheck",
      "aboutGetVersions",
      "gitDeleteBranch",
    ]));
    expect(keys).not.toEqual(expect.arrayContaining([
      "chatSend",
      "sessionLoad",
    ]));
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

  it("promotes teams leftovers, agent neighbors, and prompt sync out of services", () => {
    for (const rel of [
      "src/main/teams/subagents-sync.ts",
      "src/main/teams/user-teams.ts",
      "src/main/teams/teams-installed.ts",
      "src/main/teams/teams-license.ts",
      "src/main/teams/pro-teams-discovery.ts",
      "src/main/teams/pro-license.ts",
      "src/main/teams/core-team-skills.ts",
      "src/main/teams/team-mcp-files.ts",
      "src/main/teams/project-mcp-defaults.ts",
      "src/main/teams/project-subagents-refresh.ts",
      "src/main/agent/task-orchestrator-gate.ts",
      "src/main/agent/vision-fallback.ts",
      "src/main/lib/provider-chat.ts",
      "src/main/prompts/rules-sync.ts",
      "src/main/prompts/prompt-sync.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    for (const rel of [
      "src/main/services/subagents-sync.ts",
      "src/main/services/user-teams.ts",
      "src/main/services/teams-installed.ts",
      "src/main/services/pro-license.ts",
      "src/main/services/task-orchestrator-gate.ts",
      "src/main/services/vision-fallback.ts",
      "src/main/services/provider-chat.ts",
      "src/main/services/rules-sync.ts",
      "src/main/services/prompt-sync.ts",
      "src/main/agent/provider-chat.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
    expect(sourceOf("src/main/teams/pro-license.ts")).not.toMatch(/from\s+["']electron["']/);
    expect(sourceOf("src/main/teams/teams-installed.ts")).not.toMatch(/from\s+["']electron["']/);
    expect(sourceOf("src/main/teams/pro-teams-discovery.ts")).not.toMatch(/from\s+["']electron["']/);
    expect(sourceOf("src/main/literature/ai-metadata/literature-ai-metadata.ts")).toMatch(
      /from\s+["'][^"']*lib\/provider-chat["']/,
    );
  });

  it("splits ipc/fs into fs, dialog, project-scaffold, and template", () => {
    const index = sourceOf("src/main/ipc/index.ts");
    expect(index).toMatch(/registerFsHandlers/);
    expect(index).toMatch(/registerDialogHandlers/);
    expect(index).toMatch(/registerProjectScaffoldHandlers/);
    expect(index).toMatch(/registerTemplateHandlers/);

    const fsSrc = sourceOf("src/main/ipc/fs.ts");
    expect(fsSrc).not.toMatch(/ipcMain\.handle\(\s*["']dialog:/);
    expect(fsSrc).not.toMatch(/ipcMain\.handle\(\s*["']template:/);
    expect(fsSrc).not.toMatch(/ipcMain\.handle\(\s*["']project:/);

    expect(sourceOf("src/main/ipc/dialog.ts")).toMatch(/ipcMain\.handle\(\s*["']dialog:/);
    expect(sourceOf("src/main/ipc/project-scaffold.ts")).toMatch(
      /ipcMain\.handle\(\s*\n?\s*["']project:create["']/,
    );
    expect(sourceOf("src/main/ipc/template.ts")).toMatch(/ipcMain\.handle\(\s*["']template:/);
  });

  it("empties src/main/services of TypeScript sources", () => {
    const dir = join(REPO, "src/main/services");
    if (!existsSync(dir)) return;
    const ts = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    expect(ts).toEqual([]);
    for (const rel of [
      "src/main/app/settings.ts",
      "src/main/app/tray.ts",
      "src/main/app/desktop-notifications.ts",
      "src/main/app/update-checker.ts",
      "src/main/app/glass-vibrancy.ts",
      "src/main/app/system-fonts.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
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

  it("keeps required main domain folders and does not invent src/domains", () => {
    for (const dir of [
      "src/main/app",
      "src/main/literature",
      "src/main/experiment",
      "src/main/compile",
      "src/main/git",
      "src/main/terminal",
      "src/main/project",
      "src/main/session",
      "src/main/skills",
      "src/main/research",
      "src/main/interaction",
    ]) {
      expect(existsSync(join(REPO, dir)), dir).toBe(true);
    }
    expect(existsSync(join(REPO, "src/domains"))).toBe(false);
    expect(existsSync(join(REPO, "src/main/services/literature-service.ts"))).toBe(false);
  });

  it("routes literature, experiment, git, and chat stores through desktop-api", () => {
    for (const rel of [
      "src/renderer/lib/desktop-api/index.ts",
      "src/renderer/lib/desktop-api/literature.ts",
      "src/renderer/lib/desktop-api/experiment.ts",
      "src/renderer/lib/desktop-api/git.ts",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(true);
    }
    expect(sourceOf("src/renderer/lib/desktop-api/index.ts")).toMatch(
      /export \{ literatureDesktop \} from "\.\/literature"/,
    );
    expect(sourceOf("src/renderer/stores/literature-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/literature["']/,
    );
    expect(sourceOf("src/renderer/stores/experiment-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/experiment["']/,
    );
    expect(sourceOf("src/renderer/stores/git-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/git["']/,
    );
    expect(sourceOf("src/renderer/stores/literature-store.ts")).not.toMatch(/window\.electronAPI/);
    expect(sourceOf("src/renderer/stores/experiment-store.ts")).not.toMatch(/window\.electronAPI/);
    expect(sourceOf("src/renderer/stores/git-store.ts")).not.toMatch(/window\.electronAPI/);
    expect(sourceOf("src/renderer/stores/chat/send.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/agent["']/,
    );
    expect(sourceOf("src/renderer/stores/chat/plan.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/research["']/,
    );
    expect(sourceOf("src/renderer/stores/chat-store.ts")).not.toMatch(/window\.electronAPI/);
    expect(sourceOf("src/renderer/stores/chat/send.ts")).not.toMatch(/window\.electronAPI/);
    expect(sourceOf("src/renderer/stores/chat/tabs.ts")).not.toMatch(/window\.electronAPI/);
    expect(sourceOf("src/renderer/stores/chat/plan.ts")).not.toMatch(/window\.electronAPI/);
  });
});

describe("code structure renderer direction (Phase 4)", () => {
  const MODE_OR_COMPONENT_FROM = /from\s+["']@\/(?:modes|components)\//;

  function storeModeComponentImports(): { rel: string; lines: string[] }[] {
    const hits: { rel: string; lines: string[] }[] = [];
    for (const file of walkTsFiles(join(REPO, "src/renderer/stores"))) {
      const rel = relative(REPO, file);
      const lines = importsFrom(file, MODE_OR_COMPONENT_FROM);
      if (lines.length > 0) hits.push({ rel, lines });
    }
    return hits;
  }

  it("keeps stores free of modes/components imports", () => {
    expect(storeModeComponentImports(), JSON.stringify(storeModeComponentImports(), null, 2)).toEqual([]);
  });

  it("keeps chat-store as a thin compose root under 800 lines", () => {
    const lines = sourceOf("src/renderer/stores/chat-store.ts").split("\n").length;
    expect(lines).toBeLessThan(800);
    expect(sourceOf("src/renderer/stores/chat-store.ts")).toMatch(/export const useChatStore/);
    expect(sourceOf("src/renderer/stores/chat/send.ts")).toMatch(/sendPrompt:/);
    expect(sourceOf("src/renderer/stores/chat/tabs.ts")).toMatch(/loadSession:/);
    expect(sourceOf("src/renderer/stores/chat/plan.ts")).toMatch(/approveAndExecutePlan:/);
    expect(existsSync(join(REPO, "src/renderer/stores/chat/tabs.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src/renderer/stores/chat/plan.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src/renderer/stores/chat/composer-queue.ts"))).toBe(true);
  });

  it("does not add a second chat zustand store", () => {
    for (const file of walkTsFiles(join(REPO, "src/renderer/stores/chat"))) {
      const rel = relative(REPO, file);
      expect(sourceOf(rel), rel).not.toMatch(/export const use\w+Store = create/);
    }
  });

  it("keeps chat-turns free of chat-store", () => {
    expect(sourceOf("src/renderer/lib/chat/chat-turns.ts")).not.toMatch(/chat-store/);
  });

  it("keeps project focus files off window.electronAPI", () => {
    for (const rel of [
      "src/renderer/stores/document-store.ts",
      "src/renderer/lib/workspace/project-lifecycle.ts",
      "src/renderer/hooks/use-project-open.ts",
    ]) {
      expect(sourceOf(rel), rel).not.toMatch(/window\.electronAPI/);
    }
  });

  it("routes leftover Phase 4 stores through existing desktop-api ports", () => {
    expect(sourceOf("src/renderer/stores/workbench-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/workbench["']/,
    );
    expect(sourceOf("src/renderer/stores/execution-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/execution["']/,
    );
    expect(sourceOf("src/renderer/stores/workspace-config-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/project["']/,
    );
    expect(sourceOf("src/renderer/stores/changes-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/fs["']/,
    );
    expect(sourceOf("src/renderer/stores/worktree-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/git["']/,
    );
    expect(sourceOf("src/renderer/stores/citation-staging-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/literature["']/,
    );
    expect(sourceOf("src/renderer/stores/settings-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/settings["']/,
    );
    expect(sourceOf("src/renderer/stores/checkpoint-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/agent["']/,
    );
    expect(sourceOf("src/renderer/stores/theme-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/settings["']/,
    );
    expect(sourceOf("src/renderer/stores/compile-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/compile["']/,
    );
    expect(sourceOf("src/renderer/stores/terminal-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/terminal["']/,
    );
    expect(sourceOf("src/renderer/stores/log-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/log["']/,
    );
    expect(sourceOf("src/renderer/stores/literature-extract-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/extract["']/,
    );
    expect(sourceOf("src/renderer/stores/command-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/commands["']/,
    );
    expect(sourceOf("src/renderer/stores/teams-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/teams["']/,
    );
    expect(sourceOf("src/renderer/stores/mcp-servers-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/mcp["']/,
    );
    expect(sourceOf("src/renderer/stores/browser-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/browser["']/,
    );
    expect(sourceOf("src/renderer/stores/pro-license-store.ts")).toMatch(
      /from\s+["']@\/lib\/desktop-api\/pro["']/,
    );
    expect(existsSync(join(REPO, "src/renderer/lib/desktop-api/settings.ts"))).toBe(true);
    for (const file of walkTsFiles(join(REPO, "src/renderer/stores"))) {
      const rel = relative(REPO, file);
      expect(sourceOf(rel), rel).not.toMatch(/window\.electronAPI/);
    }
  });

  it("makes RightTab a kind-discriminated union", () => {
    const src = sourceOf("src/renderer/lib/workspace/mode-registry.ts");
    expect(src).toMatch(/export type RightTab =/);
    expect(src).not.toMatch(/export interface RightTab \{/);
  });

  it("removes the private experiment run confirm modal", () => {
    expect(
      existsSync(join(REPO, "src/renderer/modes/experiments-mode/experiments-run-confirm-modal.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(REPO, "src/renderer/components/modules/chat/permission-ask-surface.tsx")),
    ).toBe(true);
  });

  it("keeps lib/git free of window.electronAPI", () => {
    for (const file of walkTsFiles(join(REPO, "src/renderer/lib/git"))) {
      const rel = relative(REPO, file);
      expect(sourceOf(rel), rel).not.toMatch(/window\.electronAPI/);
    }
  });

  it("keeps apply-template-flow on desktop-api ports", () => {
    const src = sourceOf("src/renderer/lib/templates/apply-template-flow.ts");
    expect(src).toMatch(/from\s+["']@\/lib\/desktop-api\/(fs|template)["']/);
    expect(src).not.toMatch(/window\.electronAPI/);
  });

  it("keeps lib/settings free of window.electronAPI", () => {
    for (const file of walkTsFiles(join(REPO, "src/renderer/lib/settings"))) {
      const rel = relative(REPO, file);
      expect(sourceOf(rel), rel).not.toMatch(/window\.electronAPI/);
    }
  });

  it("keeps prompt and backup settings panels off window.electronAPI", () => {
    for (const rel of [
      "src/renderer/components/modules/settings/knowledge-modules-panel.tsx",
      "src/renderer/components/modules/settings/prompt-stack-preview-panel.tsx",
      "src/renderer/components/modules/settings/prompts-rules-settings.tsx",
      "src/renderer/components/modules/settings/agent-tools-panel.tsx",
      "src/renderer/components/modules/settings/backups-settings-panel.tsx",
      "src/renderer/components/modules/settings/prompt-markdown-panel.tsx",
      "src/renderer/components/modules/settings/rule-markdown-panel.tsx",
      "src/renderer/components/modules/settings/profile-editor-form.tsx",
      "src/renderer/components/modules/settings/research-brief-panel.tsx",
      "src/renderer/components/modules/settings/literature-settings.tsx",
      "src/renderer/components/modules/settings/workspace-settings.tsx",
      "src/renderer/components/modules/settings/texworkspace-settings.tsx",
      "src/renderer/components/modules/settings/general-settings.tsx",
      "src/renderer/components/modules/settings/team-create-panel.tsx",
      "src/renderer/components/modules/settings/teams-settings.tsx",
      "src/renderer/components/modules/settings/commands-settings.tsx",
      "src/renderer/components/modules/settings/tools-mcp-settings.tsx",
      "src/renderer/components/modules/settings/mcp-server-editor-panel.tsx",
      "src/renderer/components/modules/settings/skills-settings.tsx",
      "src/renderer/components/modules/settings/skill-library-panel.tsx",
      "src/renderer/components/modules/settings/skill-markdown-panel.tsx",
      "src/renderer/components/modules/settings/subagent-editor-panel.tsx",
      "src/renderer/components/modules/settings/orchestrator-editor-panel.tsx",
    ]) {
      expect(sourceOf(rel), rel).not.toMatch(/window\.electronAPI/);
    }
  });

  it("keeps leftover research, slash, and reveal helpers off window.electronAPI", () => {
    for (const rel of [
      "src/renderer/lib/files/open-research-brief.ts",
      "src/renderer/lib/files/reveal-project-path.ts",
      "src/renderer/lib/chat/slash-catalog.ts",
      "src/renderer/components/modules/chat/user-message-header.tsx",
      "src/renderer/hooks/use-chat-composer.ts",
      "src/renderer/hooks/use-workspace-project-autosave.ts",
    ]) {
      expect(sourceOf(rel), rel).not.toMatch(/window\.electronAPI/);
    }
  });
});

