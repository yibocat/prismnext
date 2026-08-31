/**
 * Typst live SVG: resident `typst watch`. Output is under ~/.prismnext/typst-live,
 * never inside the paper `--root` (that re-triggers watch on every SVG write).
 *
 * PDF / export stay on `typst compile` in typst.ts. This module is not LaTeX auto-compile.
 */

import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
  typstLegacyProjectLiveDirRel,
  typstLivePageFileTemplate,
} from "../../shared/compile/typst-format";
import { HOME_TYPST_LIVE_DIRNAME } from "../../shared/workbench/paths";
import { createLogger } from "../app/logger";
import { resolveWorkbenchHome } from "../workbench/home";
import type { CompileFlushOptions } from "./types";
import type { TypstExportFile, TypstFormatCompileResult } from "./typst";
import { parseTypstLog } from "./typst-log";
import { resolveTypstBinary, typstUnavailableError } from "./typst-binary";

const log = createLogger("typst-live", "compile");

const WATCH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.PRISM_COMPILE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 10_000 ? raw : 60_000;
})();

const IDLE_DISPOSE_MS = 5 * 60 * 1000;

export function typstLiveOutDir(projectDir: string, stem: string): string {
  const key = createHash("sha256").update(projectDir).digest("hex").slice(0, 16);
  return join(resolveWorkbenchHome(), HOME_TYPST_LIVE_DIRNAME, key, stem);
}

export function typstWatchSvgArgs(
  projectDir: string,
  absMain: string,
  absOutTemplate: string,
): string[] {
  return ["watch", "--root", projectDir, "--format", "svg", absMain, absOutTemplate];
}

export function stripTypstWatchAnsi(text: string): string {
  return text
    .replace(/\u001bc/g, "")
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\].*?(?:\x07|\x1b\\)/g, "");
}

function finishedMatches(text: string): RegExpMatchArray[] {
  return [...stripTypstWatchAnsi(text).matchAll(/compiled (successfully|with warnings|with errors)/g)];
}

export function parseTypstWatchStatus(text: string): "ok" | "err" | null {
  const matches = finishedMatches(text);
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  return last === "with errors" ? "err" : "ok";
}

export function countTypstWatchFinished(text: string): number {
  return finishedMatches(text).length;
}

/** Watch status lines are not Typst errors. Only keep `error:` diagnostics. */
export function liveErrorExcerpt(raw: string): string {
  const text = stripTypstWatchAnsi(raw).replace(/\r\n/g, "\n");
  const idx = text.lastIndexOf("error:");
  if (idx < 0) return "";
  return text.slice(idx).trim();
}

type WatchWaiter = {
  minGeneration: number;
  resolve: (result: { ok: boolean; timedOut: boolean; log: string }) => void;
};

class TypstWatchSession {
  private proc: ChildProcess | null = null;
  private carry = "";
  private errorExcerpt = "";
  private generation = 0;
  private lastOk = true;
  private waiters: WatchWaiter[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private dead = false;

  constructor(
    readonly bin: string,
    readonly projectDir: string,
    readonly absMain: string,
    readonly absOutTemplate: string,
  ) {}

  get currentGeneration(): number {
    return this.generation;
  }

  start(): void {
    if (this.proc && !this.dead) return;
    this.dead = false;
    this.proc = spawn(this.bin, typstWatchSvgArgs(this.projectDir, this.absMain, this.absOutTemplate), {
      cwd: this.projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
    });
    const onChunk = (buf: Buffer) => this.onChunk(buf.toString("utf8"));
    this.proc.stdout?.on("data", onChunk);
    this.proc.stderr?.on("data", onChunk);
    this.proc.on("error", (err) => {
      log.warn("watch.spawn.error", { message: err.message });
      this.failAll(err.message);
    });
    this.proc.on("close", (code) => {
      this.dead = true;
      this.proc = null;
      this.failAll(`typst watch exited (${code ?? "null"})`);
    });
    this.bumpIdle();
  }

  isAlive(): boolean {
    return Boolean(this.proc) && !this.dead;
  }

  waitForGeneration(minGeneration: number): Promise<{ ok: boolean; timedOut: boolean; log: string }> {
    this.bumpIdle();
    if (this.dead) {
      return Promise.resolve({ ok: false, timedOut: false, log: this.errorExcerpt });
    }
    if (this.generation >= minGeneration) {
      return Promise.resolve({ ok: this.lastOk, timedOut: false, log: this.errorExcerpt });
    }
    return new Promise((resolve) => {
      const waiter: WatchWaiter = { minGeneration, resolve };
      this.waiters.push(waiter);
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        resolve({ ok: false, timedOut: true, log: this.errorExcerpt });
      }, WATCH_TIMEOUT_MS);
      const inner = waiter.resolve;
      waiter.resolve = (result) => {
        clearTimeout(timer);
        inner(result);
      };
    });
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.failAll("typst watch disposed");
    this.dead = true;
    this.proc?.kill();
    this.proc = null;
  }

  private bumpIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose(), IDLE_DISPOSE_MS);
  }

  private onChunk(chunk: string): void {
    const text = stripTypstWatchAnsi(chunk);
    const combined = this.carry + text;
    const excerpt = liveErrorExcerpt(combined);
    if (excerpt) this.errorExcerpt = excerpt;
    const matches = finishedMatches(combined);
    if (matches.length === 0) {
      this.carry = combined.slice(-80);
      return;
    }
    this.generation += matches.length;
    const lastKind = matches[matches.length - 1]?.[1];
    this.lastOk = lastKind !== "with errors";
    const last = matches[matches.length - 1]!;
    const idx = combined.lastIndexOf(last[0]!);
    this.carry = combined.slice(idx + last[0]!.length).slice(-80);
    const ready = this.waiters.filter((waiter) => this.generation >= waiter.minGeneration);
    this.waiters = this.waiters.filter((waiter) => this.generation < waiter.minGeneration);
    for (const waiter of ready) {
      waiter.resolve({ ok: this.lastOk, timedOut: false, log: this.errorExcerpt });
    }
  }

  private failAll(reason: string): void {
    const waiters = this.waiters;
    this.waiters = [];
    const message = this.errorExcerpt.trim() ? this.errorExcerpt : reason;
    for (const waiter of waiters) {
      waiter.resolve({ ok: false, timedOut: false, log: message });
    }
  }
}

const sessions = new Map<string, TypstWatchSession>();
const tails = new Map<string, Promise<unknown>>();

function sessionKey(projectDir: string, mainFile: string): string {
  return `${projectDir}\0${mainFile}`;
}

function enqueueKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  tails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export function disposeTypstLiveWatchers(): void {
  for (const session of sessions.values()) session.dispose();
  sessions.clear();
}

async function flushDirtyFiles(
  projectDir: string,
  dirtyFiles: Array<{ relPath: string; content: string }> | undefined,
): Promise<boolean> {
  let changed = false;
  for (const { relPath, content } of dirtyFiles ?? []) {
    const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
    const abs = join(projectDir, normalized);
    await mkdir(dirname(abs), { recursive: true });
    let previous: string | null = null;
    try {
      previous = await readFile(abs, "utf8");
    } catch {
      previous = null;
    }
    if (previous === content) continue;
    await writeFile(abs, content, "utf8");
    changed = true;
  }
  return changed;
}

const PAGE_FILE_RE = /^(.+)-(\d+)-of-(\d+)\.svg$/i;

export function selectLiveSvgPageNames(names: string[], mtimes: Map<string, number>): string[] {
  const groups = new Map<number, { names: string[]; newest: number }>();
  for (const name of names) {
    const match = name.match(PAGE_FILE_RE);
    if (!match) continue;
    const total = Number(match[3]);
    const group = groups.get(total) ?? { names: [], newest: 0 };
    group.names.push(name);
    group.newest = Math.max(group.newest, mtimes.get(name) ?? 0);
    groups.set(total, group);
  }
  if (groups.size === 0) {
    return names.filter((name) => name.toLowerCase().endsWith(".svg") && !name.startsWith(".")).sort((a, b) => a.localeCompare(b));
  }
  let picked: { names: string[]; newest: number } | null = null;
  for (const group of groups.values()) {
    if (!picked || group.newest > picked.newest) picked = group;
  }
  return (picked?.names ?? []).sort((a, b) => {
    const pa = Number(a.match(PAGE_FILE_RE)?.[2] ?? 0);
    const pb = Number(b.match(PAGE_FILE_RE)?.[2] ?? 0);
    return pa - pb || a.localeCompare(b);
  });
}

async function readLiveSvgPages(dir: string): Promise<TypstExportFile[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".svg") && !name.startsWith("."));
  if (names.length === 0) return [];
  const mtimes = new Map<string, number>();
  for (const name of names) {
    mtimes.set(name, (await stat(join(dir, name))).mtimeMs);
  }
  const chosen = selectLiveSvgPageNames(names, mtimes);
  const files: TypstExportFile[] = [];
  for (const name of chosen) {
    files.push({ name, bytes: await readFile(join(dir, name)) });
  }
  return files;
}

async function emptyDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

function failedResult(
  buildDir: string,
  rawLog: string,
  fallback: string,
): TypstFormatCompileResult {
  const excerpt = liveErrorExcerpt(rawLog);
  const parsed = parseTypstLog(excerpt);
  return {
    success: false,
    error: parsed.errorSummary || fallback,
    logContent: excerpt,
    buildDir,
  };
}

export async function compileTypstLiveSvg(
  projectDir: string,
  mainFile: string,
  options: CompileFlushOptions = {},
): Promise<TypstFormatCompileResult> {
  const binary = await resolveTypstBinary();
  const normalized = mainFile.replace(/\\/g, "/").replace(/^\.\//, "");
  const stem = basename(normalized, extname(normalized));
  const buildDir = typstLiveOutDir(projectDir, stem);
  if (!binary.available) {
    return { success: false, error: typstUnavailableError(), buildDir };
  }

  const absMain = join(projectDir, normalized);
  if (!existsSync(absMain) && !(options.dirtyFiles ?? []).some((file) => file.relPath.replace(/\\/g, "/") === normalized)) {
    return { success: false, error: `Main file not found: ${mainFile}`, buildDir };
  }

  const absOut = join(buildDir, typstLivePageFileTemplate(stem));
  const key = sessionKey(projectDir, normalized);

  return enqueueKey(key, async () => {
    let session = sessions.get(key);
    if (session && !session.isAlive()) {
      session.dispose();
      sessions.delete(key);
      session = undefined;
    }

    if (!session) {
      await rm(join(projectDir, typstLegacyProjectLiveDirRel(stem)), { recursive: true, force: true });
      await emptyDir(buildDir);
      await flushDirtyFiles(projectDir, options.dirtyFiles);
      if (!existsSync(absMain)) {
        return { success: false, error: `Main file not found: ${mainFile}`, buildDir };
      }
      session = new TypstWatchSession(binary.path, projectDir, absMain, absOut);
      sessions.set(key, session);
      session.start();
      const first = await session.waitForGeneration(1);
      if (first.timedOut) {
        return failedResult(buildDir, first.log, "Typst live preview timed out.");
      }
      if (!first.ok) {
        return failedResult(buildDir, first.log, "Compilation failed");
      }
    } else {
      const gen = session.currentGeneration;
      const changed = await flushDirtyFiles(projectDir, options.dirtyFiles);
      if (changed) {
        const next = await session.waitForGeneration(gen + 1);
        if (next.timedOut) {
          return failedResult(buildDir, next.log, "Typst live preview timed out.");
        }
        if (!next.ok) {
          return failedResult(buildDir, next.log, "Compilation failed");
        }
      }
    }

    const files = await readLiveSvgPages(buildDir);
    if (files.length === 0) {
      return failedResult(buildDir, "", "Compilation failed");
    }
    return { success: true, files, logContent: "", buildDir };
  });
}
