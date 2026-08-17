/**
 * Native System, Shell, and Filesystem Tools for PrismNext Pi Agent Host.
 *
 * 5 tools covering multimodal vision helper, shell execution (PTY),
 * file deletion, file move/rename, and project rule persistence.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, renameSync, writeFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, extname } from "node:path";
import { execSync } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/tool-names";
import { runAiBashJob } from "../../services/ai-bash-runner";
import { resolveFigureAbsPath } from "../../../shared/interaction-figure-fs";
import {
  resolveProjectRuleWrite,
  type ProjectRuleWriteMode,
} from "../../../shared/project-rule-md";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function gitTopLevel(startDir: string): string | undefined {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function isGitTracked(gitRoot: string, relPath: string): boolean {
  try {
    execSync(`git ls-files --error-unmatch -- ${shellQuote(relPath)}`, {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function resolvePathInProject(raw: string, projectRoot: string): string {
  return isAbsolute(raw) ? raw : join(projectRoot, raw);
}

function deleteFile(filePath: string): void {
  const gitRoot = gitTopLevel(dirname(filePath));
  if (gitRoot) {
    const rel = relative(gitRoot, filePath);
    if (rel && !rel.startsWith("..") && isGitTracked(gitRoot, rel)) {
      execSync(`git rm -f -- ${shellQuote(rel)}`, {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return;
    }
  }
  unlinkSync(filePath);
}

function moveFile(src: string, dst: string): void {
  const dstDir = dirname(dst);
  if (!existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true });
  }

  const gitRoot = gitTopLevel(dirname(src));
  if (gitRoot) {
    const relSrc = relative(gitRoot, src);
    const relDst = relative(gitRoot, dst);
    if (
      relSrc &&
      !relSrc.startsWith("..") &&
      relDst &&
      !relDst.startsWith("..") &&
      isGitTracked(gitRoot, relSrc)
    ) {
      execSync(`git mv -f -- ${shellQuote(relSrc)} ${shellQuote(relDst)}`, {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });
      return;
    }
  }
  renameSync(src, dst);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export const imageDescribeTool: NativeToolDefinition = {
  name: TOOL_NAMES.imageDescribe,
  label: "Describe Image",
  description: "Describe an image file with the configured multimodal vision helper model.",
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: "Project-relative or absolute path to the image file" })),
    imagePath: Type.Optional(Type.String({ description: "Alternative alias for path" })),
    question: Type.Optional(Type.String({ description: "Optional question to guide the description" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const rawPath = str(args.path) || str(args.imagePath);
    if (!rawPath) return { ok: false, error: "missing_image_path" };

    const { resolveVisionHelperFromSettings, describeImagesWithConfiguredHelper } = await import("../../services/vision-fallback");
    const helper = resolveVisionHelperFromSettings();
    if (!helper) {
      return {
        ok: false,
        error: "No multimodal helper model configured. Set one in Settings → Models → Multimodal helper.",
      };
    }

    const absPath = resolveFigureAbsPath(ctx.projectRoot, rawPath);
    if (!absPath) {
      return { ok: false, error: `Image path escapes the project root: ${rawPath}` };
    }

    const ext = extname(absPath).toLowerCase().slice(1);
    const mimeType = IMAGE_MIME_BY_EXT[ext];
    if (!mimeType) {
      return { ok: false, error: `Unsupported image type: .${ext} (use png, jpg, jpeg, webp, gif)` };
    }

    let size = 0;
    try {
      const st = statSync(absPath);
      if (!st.isFile()) return { ok: false, error: `Not a file: ${rawPath}` };
      size = st.size;
    } catch {
      return { ok: false, error: `Image file not found on disk: ${rawPath}` };
    }

    if (size > MAX_IMAGE_BYTES) {
      return { ok: false, error: `Image is too large (${(size / 1024 / 1024).toFixed(1)} MB > 5 MB cap)` };
    }

    try {
      const data = readFileSync(absPath).toString("base64");
      const question = str(args.question) || undefined;
      const descResult = await describeImagesWithConfiguredHelper([
        { data, mimeType, name: rawPath, question },
      ]);
      const first = descResult[0];
      if (!first) {
        return { ok: false, error: "describe_failed" };
      }

      return {
        ok: true,
        imagePath: rawPath,
        question: question ?? null,
        description: first.text,
        helperModel: `${helper.providerId}/${helper.modelId}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export const bashTool: NativeToolDefinition = {
  name: TOOL_NAMES.bash,
  label: "Shell Command",
  description: "Execute shell commands in the project directory via ai-pty.",
  parameters: Type.Object({
    command: Type.String({ minLength: 1, description: "Shell command to execute" }),
    cwd: Type.Optional(Type.String({ description: "Working directory (defaults to projectRoot)" })),
    description: Type.Optional(Type.String({ description: "Short description of what the command does" })),
  }),
  permission: {
    category: "shell_exec",
    extractBash: (args, projectRoot) => ({
      command: str(args.command),
      cwd: str(args.cwd) || projectRoot,
    }),
  },
  async execute(args, ctx) {
    const command = str(args.command);
    if (!command) return { ok: false, error: "missing_command" };

    const cwd = str(args.cwd) || ctx.projectRoot;
    return runAiBashJob({
      sessionId: ctx.runtimeSessionId,
      chatTabId: ctx.tabId,
      toolCallId: ctx.toolCallId,
      command,
      cwd,
      projectRoot: ctx.projectRoot,
    });
  },
};

export const deleteTool: NativeToolDefinition = {
  name: TOOL_NAMES.delete,
  label: "Delete File",
  description: "Delete a single file by path in the project (uses git rm for tracked files).",
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: "Relative or absolute file path to delete" })),
    filePath: Type.Optional(Type.String({ description: "Alternative alias for path" })),
    file: Type.Optional(Type.String({ description: "Alternative alias for path" })),
  }),
  permission: {
    category: "destructive",
    extractPath: (args) => str(args.path) || str(args.filePath) || str(args.file),
  },
  async execute(args, ctx) {
    const raw = str(args.path) || str(args.filePath) || str(args.file);
    if (!raw) return { ok: false, error: "missing_path" };

    const absPath = resolvePathInProject(raw, ctx.projectRoot);
    if (!existsSync(absPath)) {
      return { ok: false, error: "file_not_found", path: raw };
    }

    try {
      deleteFile(absPath);
      return { success: true, path: raw };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export const moveTool: NativeToolDefinition = {
  name: TOOL_NAMES.move,
  label: "Move File",
  description: "Move or rename a file in the project (uses git mv for tracked files).",
  parameters: Type.Object({
    source: Type.Optional(Type.String({ description: "Source file path" })),
    from: Type.Optional(Type.String({ description: "Alternative alias for source" })),
    destination: Type.Optional(Type.String({ description: "Destination file path" })),
    to: Type.Optional(Type.String({ description: "Alternative alias for destination" })),
  }),
  permission: {
    category: "destructive",
    extractPath: (args) => ({
      sourcePath: str(args.source) || str(args.from),
      destinationPath: str(args.destination) || str(args.to),
    }),
  },
  async execute(args, ctx) {
    const rawSrc = str(args.source) || str(args.from);
    const rawDst = str(args.destination) || str(args.to);
    if (!rawSrc || !rawDst) {
      return { ok: false, error: "missing_source_or_destination" };
    }

    const absSrc = resolvePathInProject(rawSrc, ctx.projectRoot);
    const absDst = resolvePathInProject(rawDst, ctx.projectRoot);
    if (!existsSync(absSrc)) {
      return { ok: false, error: "source_not_found", source: rawSrc };
    }

    try {
      moveFile(absSrc, absDst);
      return { success: true, source: rawSrc, destination: rawDst };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export const projectRuleWriteTool: NativeToolDefinition = {
  name: TOOL_NAMES.projectRuleWrite,
  label: "Write Project Rule",
  description: "Create or update a persistent project rule (.prismnext/agent/rules/<name>/RULE.md).",
  parameters: Type.Object({
    name: Type.String({ minLength: 1, description: "Rule name slug (kebab-case)" }),
    description: Type.String({ minLength: 1, description: "Short description of what the rule enforces" }),
    body: Type.String({ minLength: 1, description: "Markdown body instructions for the rule" }),
    mode: Type.Optional(Type.String({ description: "create | replace | append (default: create)" })),
    apply: Type.Optional(Type.String({ description: "Rule apply scope (always)" })),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => {
      const name = str(args.name);
      return name ? `.prismnext/agent/rules/${name}/RULE.md` : null;
    },
  },
  async execute(args, ctx) {
    const name = str(args.name);
    const description = str(args.description);
    const body = typeof args.body === "string" ? args.body : "";
    const modeRaw = str(args.mode).toLowerCase() || "create";
    const mode = (modeRaw === "replace" || modeRaw === "append" ? modeRaw : "create") as ProjectRuleWriteMode;
    const apply = str(args.apply) || "always";

    const ruleDir = join(ctx.projectRoot, ".prismnext", "agent", "rules", name);
    const ruleFile = join(ruleDir, "RULE.md");

    let existingContent: string | null = null;
    if (existsSync(ruleFile)) {
      try {
        existingContent = readFileSync(ruleFile, "utf-8");
      } catch {
        existingContent = null;
      }
    }

    const resolved = resolveProjectRuleWrite({
      existingContent,
      name,
      description,
      body,
      mode,
      apply,
    });

    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    try {
      mkdirSync(ruleDir, { recursive: true });
      writeFileSync(ruleFile, resolved.content, "utf-8");
      return {
        success: true,
        name,
        mode: resolved.mode,
        path: `.prismnext/agent/rules/${name}/RULE.md`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },
};

export const SYSTEM_TOOLS: NativeToolDefinition[] = [
  imageDescribeTool,
  deleteTool,
  moveTool,
  projectRuleWriteTool,
];
