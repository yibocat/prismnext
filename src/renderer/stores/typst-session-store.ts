/**
 * Typst live preview: Tinymist LSP (typstDesktop) for local and remote projects.
 * Remote Host sessions are reached via typst:* IPC + SSH -L; iframe stays on laptop 127.0.0.1.
 *
 * Renderer must serialize ensure → didOpen → previewStart. Parallel fire-and-forget
 * used to spawn two `tinymist lsp` processes or start preview before didOpen, so the
 * pane tracked the file on disk (autosave) instead of the buffer.
 */

import { create } from "zustand";
import {
  compileRootsForTypstDiagnostics,
  diagnosticsFromTypstLspItems,
  paperKeyFromMainFile,
} from "@/lib/compile/compile-artifact";
import { typstDesktop } from "@/lib/desktop-api/typst";
import {
  compileArtifactCacheKey,
  compileEngineFromRelPath,
} from "@shared/compile/artifact-key";
import type { TypstDiagnosticsEvent, TypstIpcError, TypstPreviewReadyEvent, TypstScrollToEvent } from "@shared/typst/session";
import { setCompileDiagnosticsForKey } from "./compile-store";
import { useDocumentStore } from "./document-store";
import { useRightPanelStore } from "./right-panel-store";

interface TypstSessionState {
  previewUrlByKey: Record<string, string>;
  startingByKey: Record<string, boolean>;
  errorByKey: Record<string, string>;
}

export const useTypstSessionStore = create<TypstSessionState>(() => ({
  previewUrlByKey: {},
  startingByKey: {},
  errorByKey: {},
}));

const versions = new Map<string, number>();
const openedRels = new Set<string>();
const startedPreviews = new Set<string>();
const ipcChains = new Map<string, Promise<unknown>>();
const pendingChanges = new Map<string, { rel: string; text: string; version: number }>();
let subscribed = false;
let epoch = 0;
let flushingChanges = false;

const IPC_MISSING =
  "Typst IPC is missing. Fully quit PrismNext and reopen — hot reload is not enough.";

function subscribeTypstEvents(): void {
  if (subscribed) return;
  subscribed = true;
  typstDesktop.onTypstPreviewReady((event) => {
    const key = compileArtifactCacheKey(paperKeyFromMainFile(event.projectRoot, event.compileRoot));
    useTypstSessionStore.setState((s) => ({
      previewUrlByKey: { ...s.previewUrlByKey, [key]: event.previewUrl },
      startingByKey: { ...s.startingByKey, [key]: false },
      errorByKey: { ...s.errorByKey, [key]: "" },
    }));
  });
  typstDesktop.onTypstDiagnostics((event) => {
    applyTypstLspDiagnostics(event);
  });
  typstDesktop.onTypstScrollTo((event) => {
    jumpToTypstSource(event);
  });
}

export function applyTypstLspDiagnostics(event: TypstDiagnosticsEvent): void {
  const roots = compileRootsForTypstDiagnostics({
    compileRootFromEvent: event.compileRoot,
    previewCompileRoots: [...startedPreviews],
    itemRelPaths: event.items.map((item) => item.relPath),
  });
  if (roots.length === 0) return;
  const diag = diagnosticsFromTypstLspItems(event.items);
  for (const compileRoot of roots) {
    setCompileDiagnosticsForKey(paperKeyFromMainFile(event.projectRoot, compileRoot), diag);
  }
}

export function jumpToTypstSource(event: TypstScrollToEvent): void {
  const rel = event.relPath.replace(/\\/g, "/");
  const files = useDocumentStore.getState().files;
  const match = files.find((file) => file.relativePath.replace(/\\/g, "/") === rel);
  if (match) {
    useRightPanelStore.getState().openFile(match.id, match.relativePath, match.name, { pin: true });
    if (event.line && event.line > 0) {
      window.setTimeout(() => {
        useDocumentStore.getState().requestJumpToLine(match.id, event.line);
      }, 80);
    }
    return;
  }
  void import("@/lib/files/open-project-file").then(({ openProjectFileFromChat }) => {
    void openProjectFileFromChat(rel, { pin: true, line: event.line });
  });
}

function isTypstProject(projectRoot: string | null): projectRoot is string {
  return Boolean(projectRoot);
}

function ipcErrorMessage(value: unknown): string | null {
  if (value == null) return IPC_MISSING;
  if (typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === true) {
    return null;
  }
  if (typeof value === "object" && "error" in value) {
    const error = (value as TypstIpcError).error;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return null;
}

function isPreviewReady(value: unknown): value is TypstPreviewReadyEvent {
  return Boolean(
    value
    && typeof value === "object"
    && "previewUrl" in value
    && typeof (value as TypstPreviewReadyEvent).previewUrl === "string",
  );
}

function enqueueIpc(projectRoot: string, op: () => Promise<unknown>): Promise<unknown> {
  const prev = ipcChains.get(projectRoot) ?? Promise.resolve();
  const next = prev.then(op, op);
  ipcChains.set(projectRoot, next.then(() => undefined, () => undefined));
  return next;
}

function bufferTextForRel(rel: string): string | null {
  const doc = useDocumentStore.getState();
  const file = doc.files.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  if (!file) return null;
  return doc.openedContents.get(file.id)?.content ?? doc.getAsset(file.id) ?? null;
}

export function notifyTypstDidOpen(fileId: string, fileRel: string, text: string): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!isTypstProject(projectRoot)) return;
  if (compileEngineFromRelPath(fileRel) !== "typst") return;
  subscribeTypstEvents();
  const rel = fileRel.replace(/\\/g, "/");
  if (openedRels.has(rel)) return;
  openedRels.add(rel);
  versions.set(rel, 1);
  const captured = epoch;
  void enqueueIpc(projectRoot, async () => {
    if (captured !== epoch) return;
    const ensured = await typstDesktop.typstEnsureSession({ projectRoot });
    const ensureErr = ipcErrorMessage(ensured);
    if (ensureErr) throw new Error(ensureErr);
    const opened = await typstDesktop.typstDidOpen({
      projectRoot,
      relPath: rel,
      version: 1,
      text,
      languageId: "typst",
    });
    const openErr = ipcErrorMessage(opened);
    if (openErr) throw new Error(openErr);
  });
}

export function notifyTypstDidChange(fileId: string, fileRel: string): void {
  const doc = useDocumentStore.getState();
  const projectRoot = doc.projectRoot;
  if (!isTypstProject(projectRoot)) return;
  if (compileEngineFromRelPath(fileRel) !== "typst") return;
  const rel = fileRel.replace(/\\/g, "/");
  const text = doc.openedContents.get(fileId)?.content ?? doc.getAsset(fileId) ?? "";
  if (!openedRels.has(rel)) {
    notifyTypstDidOpen(fileId, rel, text);
    return;
  }
  const version = (versions.get(rel) ?? 1) + 1;
  versions.set(rel, version);
  pendingChanges.set(rel, { rel, text, version });
  void flushDidChanges(projectRoot);
}

async function flushDidChanges(projectRoot: string): Promise<void> {
  if (flushingChanges) return;
  flushingChanges = true;
  const captured = epoch;
  try {
    while (pendingChanges.size > 0) {
      if (captured !== epoch) return;
      const batch = [...pendingChanges.values()];
      pendingChanges.clear();
      await enqueueIpc(projectRoot, async () => {
        if (captured !== epoch) return;
        for (const item of batch) {
          const result = await typstDesktop.typstDidChange({
            projectRoot,
            relPath: item.rel,
            version: item.version,
            text: item.text,
            languageId: "typst",
          });
          const err = ipcErrorMessage(result);
          if (err) throw new Error(err);
        }
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useTypstSessionStore.setState((s) => {
      const next = { ...s.errorByKey };
      for (const compileRoot of startedPreviews) {
        const key = compileArtifactCacheKey(paperKeyFromMainFile(projectRoot, compileRoot));
        next[key] = message;
      }
      return { errorByKey: next };
    });
  } finally {
    flushingChanges = false;
    if (pendingChanges.size > 0 && captured === epoch) {
      void flushDidChanges(projectRoot);
    }
  }
}

export function notifyTypstTabClosed(fileRel: string): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!isTypstProject(projectRoot)) return;
  const rel = fileRel.replace(/\\/g, "/");
  if (compileEngineFromRelPath(rel) !== "typst") return;
  const stillOpen = useRightPanelStore.getState().tabs.some(
    (tab) => tab.kind === "file" && (tab.filePath === rel || tab.fileId === rel),
  );
  if (stillOpen) return;
  if (openedRels.has(rel)) {
    openedRels.delete(rel);
    versions.delete(rel);
    pendingChanges.delete(rel);
    void enqueueIpc(projectRoot, async () => {
      await typstDesktop.typstDidClose({ projectRoot, relPath: rel });
    });
  }
  maybeStopPreviews(projectRoot);
}

export function ensureTypstPreview(compileRootRel: string): void {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!isTypstProject(projectRoot)) return;
  subscribeTypstEvents();
  const compileRoot = compileRootRel.replace(/\\/g, "/");
  const key = compileArtifactCacheKey(paperKeyFromMainFile(projectRoot, compileRoot));
  const state = useTypstSessionStore.getState();
  if (state.previewUrlByKey[key] || state.startingByKey[key]) return;
  useTypstSessionStore.setState((s) => ({
    startingByKey: { ...s.startingByKey, [key]: true },
    errorByKey: { ...s.errorByKey, [key]: "" },
  }));
  startedPreviews.add(compileRoot);
  const captured = epoch;
  void enqueueIpc(projectRoot, async () => {
    if (captured !== epoch) return;
    const ensured = await typstDesktop.typstEnsureSession({ projectRoot });
    const ensureErr = ipcErrorMessage(ensured);
    if (ensureErr) throw new Error(ensureErr);
    const existingText = bufferTextForRel(compileRoot);
    if (existingText != null && !openedRels.has(compileRoot)) {
      openedRels.add(compileRoot);
      versions.set(compileRoot, 1);
      const opened = await typstDesktop.typstDidOpen({
        projectRoot,
        relPath: compileRoot,
        version: 1,
        text: existingText,
        languageId: "typst",
      });
      const openErr = ipcErrorMessage(opened);
      if (openErr) throw new Error(openErr);
    }
    const ready = await typstDesktop.typstPreviewStart({ projectRoot, compileRoot });
    if (captured !== epoch) return;
    if (isPreviewReady(ready)) {
      useTypstSessionStore.setState((s) => ({
        previewUrlByKey: { ...s.previewUrlByKey, [key]: ready.previewUrl },
        startingByKey: { ...s.startingByKey, [key]: false },
        errorByKey: { ...s.errorByKey, [key]: "" },
      }));
      return;
    }
    throw new Error(ipcErrorMessage(ready) ?? "Tinymist preview did not return a URL");
  }).catch((err) => {
    if (captured !== epoch) return;
    const message = err instanceof Error ? err.message : String(err);
    useTypstSessionStore.setState((s) => ({
      startingByKey: { ...s.startingByKey, [key]: false },
      errorByKey: { ...s.errorByKey, [key]: message },
    }));
  });
}

function maybeStopPreviews(projectRoot: string): void {
  const hasTypTab = useRightPanelStore.getState().tabs.some(
    (tab) => tab.kind === "file" && compileEngineFromRelPath(tab.filePath ?? tab.fileId ?? "") === "typst",
  );
  if (hasTypTab) return;
  for (const compileRoot of startedPreviews) {
    void typstDesktop.typstPreviewStop({ projectRoot, compileRoot });
  }
  startedPreviews.clear();
  useTypstSessionStore.setState({ previewUrlByKey: {}, startingByKey: {}, errorByKey: {} });
}

export function resetTypstSessionStore(): void {
  epoch += 1;
  openedRels.clear();
  versions.clear();
  startedPreviews.clear();
  pendingChanges.clear();
  ipcChains.clear();
  flushingChanges = false;
  useTypstSessionStore.setState({ previewUrlByKey: {}, startingByKey: {}, errorByKey: {} });
}
