import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import type { BrowserWindow } from "electron";

// ─── Types ───

export interface ClaudeStatus {
  installed: boolean;
  authenticated: boolean;
  binaryPath: string | null;
}

// ─── Process Management ───

const activeProcesses = new Map<string, ChildProcess>();
const processStdins = new Map<string, NodeJS.WritableStream>();
const completedTabs = new Set<string>();

// ─── System Prompt ───

const SYSTEM_PROMPT = [
  "You are an AI assistant integrated into a LaTeX document editor (Prism). ",
  "Follow these rules strictly:\n",
  "1. PLANNING FIRST: Before making changes, use TodoWrite to create a step-by-step plan. ",
  "Break large tasks into small, incremental steps (one section or one logical unit per step).\n",
  "2. INCREMENTAL EDITS: Use the Edit tool to make small, targeted changes — one step at a time. ",
  "NEVER write or rewrite an entire file at once. Always prefer editing existing content over replacing it wholesale.\n",
  "3. STEP BY STEP: After each edit, mark the todo item as completed, then proceed to the next step. ",
  "This lets the user review changes incrementally.\n",
  "4. PRESERVE EXISTING CONTENT: Always read the file first. Keep the existing preamble, packages, ",
  "and structure intact. Only add or modify what is needed for the current step.\n",
  "5. LaTeX BEST PRACTICES: Use proper sectioning (\\chapter, \\section, \\subsection), ",
  "citations (\\cite), cross-references (\\label, \\ref), and BibTeX for bibliographies.\n",
  "6. SKILLS: If scientific skills are installed in .claude/skills/, follow their guidelines ",
  "for domain-specific tasks. Use skill-provided LaTeX packages (.sty) and code patterns.\n",
  "7. PYTHON: If a .venv/ exists in the project, it is already activated. ",
  "Use `uv pip install` to add packages and `python` to run scripts.",
].join("");

// ─── Binary Discovery ───

function findClaudeBinary(): string | null {
  const home = homedir();
  const sep = process.platform === "win32" ? "\\" : "/";

  // 1. Native installer default
  const nativePath = join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  if (existsSync(nativePath)) return nativePath;

  // 2. NVM_BIN
  const nvmBin = process.env.NVM_BIN;
  if (nvmBin) {
    const p = join(nvmBin, "claude");
    if (existsSync(p)) return p;
  }

  // 2b. PNPM_HOME
  const pnpmHome = process.env.PNPM_HOME;
  if (pnpmHome) {
    const p = join(pnpmHome, "claude");
    if (existsSync(p)) return p;
  }

  // 3. which claude (sync)
  try {
    const { execSync } = require("child_process");
    const result = execSync("which claude 2>/dev/null", { encoding: "utf-8" }).trim();
    if (result && existsSync(result)) return result;
  } catch {}

  // 4. Login shell (macOS/Linux)
  if (process.platform !== "win32") {
    const shellPath = runLoginShellCommand("command -v claude");
    if (shellPath && existsSync(shellPath)) return shellPath;
  }

  // 5. NVM directories scan
  const nvmDir = join(home, ".nvm", "versions", "node");
  if (existsSync(nvmDir)) {
    try {
      const { readdirSync } = require("fs");
      const versions = readdirSync(nvmDir).sort().reverse();
      for (const ver of versions) {
        const p = join(nvmDir, ver, "bin", "claude");
        if (existsSync(p)) return p;
      }
    } catch {}
  }

  // 6. Standard paths
  const standardPaths = ["/usr/local/bin/claude", "/opt/homebrew/bin/claude", "/usr/bin/claude"];
  for (const p of standardPaths) {
    if (existsSync(p)) return p;
  }

  // 7. User-specific paths
  const userPaths = [
    join(home, "Library", "pnpm", "claude"),
    join(home, ".local", "share", "pnpm", "claude"),
    join(home, ".pnpm", "claude"),
    join(home, ".claude", "local", "claude"),
    join(home, ".npm-global", "bin", "claude"),
    join(home, ".yarn", "bin", "claude"),
    join(home, ".bun", "bin", "claude"),
    join(home, "bin", "claude"),
  ];
  for (const p of userPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

function runLoginShellCommand(command: string): string | null {
  const shells = [];
  if (process.env.SHELL) shells.push(process.env.SHELL);
  for (const fallback of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
    if (!shells.includes(fallback) && existsSync(fallback)) shells.push(fallback);
  }

  for (const shell of shells) {
    try {
      const { execSync } = require("child_process");
      const result = execSync(`${shell} -l -c "${command}"`, { encoding: "utf-8", timeout: 5000 }).trim();
      if (result && result !== "undefined" && result !== "null") return result;
    } catch {}
  }
  return null;
}

// ─── PATH Augmentation ───

function buildAugmentedPath(cwd: string): string {
  const home = homedir();
  const sep = process.platform === "win32" ? ";" : ":";
  let pathParts = (process.env.PATH || "").split(sep);

  const extraDirs = [
    join(home, ".local", "bin"),
    join(home, ".cargo", "bin"),
    join(home, ".bun", "bin"),
    join(home, "Library", "pnpm"),
    join(home, "Library", "pnpm", "global", "bin"),
    join(home, ".local", "share", "pnpm"),
    join(home, ".local", "share", "pnpm", "global", "bin"),
    join(home, ".pnpm"),
    join(home, ".pnpm", "global", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];

  const pnpmHome = process.env.PNPM_HOME;
  if (pnpmHome) extraDirs.unshift(pnpmHome);

  // NVM
  const nvmBin = process.env.NVM_BIN;
  if (nvmBin) {
    extraDirs.unshift(nvmBin);
  } else {
    const nvmDir = join(home, ".nvm", "versions", "node");
    if (existsSync(nvmDir)) {
      try {
        const { readdirSync } = require("fs");
        const versions = readdirSync(nvmDir).sort().reverse();
        if (versions.length > 0) extraDirs.unshift(join(nvmDir, versions[0], "bin"));
      } catch {}
    }
  }

  // venv
  const venvDir = join(cwd, ".venv");
  if (existsSync(venvDir)) {
    const venvBin = process.platform === "win32" ? join(venvDir, "Scripts") : join(venvDir, "bin");
    extraDirs.unshift(venvBin);
  }

  // Prepend extra dirs that exist and aren't already in PATH
  for (const dir of extraDirs.reverse()) {
    if (existsSync(dir) && !pathParts.includes(dir)) {
      pathParts.unshift(dir);
    }
  }

  return pathParts.join(sep);
}

// ─── Clean Environment ───

function buildCleanEnv(cwd: string, effortLevel?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Remove Claude internal env vars
  delete env.CLAUDECODE;
  delete env.CLAUDE_AGENT_SDK_VERSION;
  for (const key of Object.keys(env)) {
    if ((key.startsWith("CLAUDE_CODE_") || key.startsWith("CLAUDE_AGENT_")) && key !== "CLAUDE_CODE_GIT_BASH_PATH") {
      delete env[key];
    }
  }

  env.CLAUDE_CODE_EFFORT_LEVEL = effortLevel || "low";
  env.PATH = buildAugmentedPath(cwd);

  // venv
  const venvDir = join(cwd, ".venv");
  if (existsSync(venvDir)) {
    env.VIRTUAL_ENV = venvDir;
  }

  return env;
}

// ─── Status Check ───

export async function checkClaudeStatus(): Promise<ClaudeStatus> {
  const binaryPath = findClaudeBinary();

  if (!binaryPath) {
    return { installed: false, authenticated: false, binaryPath: null };
  }

  // Try running `claude --version` to verify it's functional
  try {
    const { execSync } = require("child_process");
    execSync(`"${binaryPath}" --version`, { encoding: "utf-8", timeout: 10000 });
    return { installed: true, authenticated: true, binaryPath };
  } catch {
    // Binary exists but might not be authenticated
    return { installed: true, authenticated: false, binaryPath };
  }
}

// ─── Spawn Claude Process ───

function buildClaudeArgs(
  prompt: string,
  sessionId?: string,
  model?: string,
): string[] {
  const args: string[] = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--append-system-prompt", SYSTEM_PROMPT,
  ];

  if (model) {
    args.push("--model", model);
  }

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  return args;
}

function spawnClaudeProcess(
  win: BrowserWindow,
  projectPath: string,
  prompt: string,
  tabId: string,
  sessionId?: string,
  model?: string,
  effortLevel?: string,
): void {
  const binaryPath = findClaudeBinary();
  if (!binaryPath) {
    win.webContents.send("claude:complete", { tabId, success: false });
    return;
  }

  // Kill any existing process for this tab
  const existing = activeProcesses.get(tabId);
  if (existing) {
    existing.kill("SIGTERM");
    activeProcesses.delete(tabId);
    processStdins.delete(tabId);
    completedTabs.delete(tabId);
  }

  const args = buildClaudeArgs(prompt, sessionId, model);
  const env = buildCleanEnv(projectPath, effortLevel);

  const child = spawn(binaryPath, args, {
    cwd: projectPath,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  activeProcesses.set(tabId, child);
  processStdins.set(tabId, child.stdin!);
  completedTabs.delete(tabId);

  // stdout → JSONL streaming
  const rl = createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    win.webContents.send("claude:stream", { tabId, data: line });
  });

  // stderr → error output
  child.stderr!.on("data", (data: Buffer) => {
    const text = data.toString();
    win.webContents.send("claude:stderr", { tabId, data: text });
  });

  // Process exit
  child.on("close", (code) => {
    activeProcesses.delete(tabId);
    processStdins.delete(tabId);
    if (completedTabs.has(tabId)) return;
    completedTabs.add(tabId);
    win.webContents.send("claude:complete", { tabId, success: code === 0 });
  });

  child.on("error", (err) => {
    console.error("[claude] Process error:", err);
    activeProcesses.delete(tabId);
    processStdins.delete(tabId);
    if (completedTabs.has(tabId)) return;
    completedTabs.add(tabId);
    win.webContents.send("claude:complete", { tabId, success: false });
  });
}

// ─── Public API ───

export async function executeClaudeCode(
  win: BrowserWindow,
  projectPath: string,
  prompt: string,
  tabId: string,
  model?: string,
  effortLevel?: string,
): Promise<void> {
  spawnClaudeProcess(win, projectPath, prompt, tabId, undefined, model, effortLevel);
}

export async function resumeClaudeCode(
  win: BrowserWindow,
  projectPath: string,
  sessionId: string,
  prompt: string,
  tabId: string,
  model?: string,
  effortLevel?: string,
): Promise<void> {
  spawnClaudeProcess(win, projectPath, prompt, tabId, sessionId, model, effortLevel);
}

export async function cancelClaudeExecution(
  win: BrowserWindow,
  tabId: string,
): Promise<void> {
  const child = activeProcesses.get(tabId);
  if (!child) return;

  completedTabs.add(tabId);

  child.kill("SIGTERM");

  // Force kill after 1s
  setTimeout(() => {
    if (activeProcesses.has(tabId)) {
      child.kill("SIGKILL");
      activeProcesses.delete(tabId);
      processStdins.delete(tabId);
    }
  }, 1000);

  win.webContents.send("claude:complete", { tabId, success: false });
}

export function answerClaudeQuestion(
  win: BrowserWindow,
  tabId: string,
  answer: string,
): void {
  const stdin = processStdins.get(tabId);
  if (!stdin || (stdin as any).destroyed) {
    win.webContents.send("claude:complete", { tabId, success: false });
    return;
  }

  // Claude CLI reads JSON from stdin in stream-json mode.
  // Send a user message with the selected answer.
  const response = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: answer,
    },
  }) + "\n";

  stdin.write(response);
}

export function killAllClaudeProcesses(): void {
  for (const [tabId, child] of activeProcesses) {
    child.kill("SIGTERM");
    activeProcesses.delete(tabId);
    processStdins.delete(tabId);
  }
  completedTabs.clear();
}

// ─── Session Management ───

function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, "-");
}

function getSessionsDir(projectPath: string): string {
  const home = homedir();
  const encoded = encodeProjectPath(projectPath);
  return join(home, ".claude", "projects", encoded);
}

export interface ClaudeSession {
  id: string;
  title: string;
  lastModified: number;
}

export async function listClaudeSessions(projectPath: string): Promise<ClaudeSession[]> {
  const sessionsDir = getSessionsDir(projectPath);
  const sessions: ClaudeSession[] = [];

  try {
    const { readdirSync, statSync, readFileSync } = require("fs");
    if (!existsSync(sessionsDir)) return [];

    const files = readdirSync(sessionsDir).filter((f: string) => f.endsWith(".jsonl"));
    for (const file of files) {
      try {
        const filePath = join(sessionsDir, file);
        const stat = statSync(filePath);
        const sessionId = file.replace(".jsonl", "");

        // Extract title from first user message
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n");
        let title = "Untitled";
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "user" && msg.message?.content) {
              // Skip local-command messages (internal Claude CLI commands)
              const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
              if (blocks.some((b: any) =>
                b.type === "text" && typeof b.text === "string" &&
                /<\/?(?:local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/.test(b.text)
              )) continue;
              let text = "";
              if (typeof msg.message.content === "string") {
                text = msg.message.content;
              } else if (Array.isArray(msg.message.content)) {
                text = blocks
                  .filter((b: any) => b.type === "text")
                  .map((b: any) => b.text)
                  .join(" ");
              }
              // Clean context prefixes and XML tags
              text = text.replace(/^\[Currently open file:.*?\]\n?\n?/, "");
              text = text.replace(/<[^>]+>/g, "").trim();
              title = text.slice(0, 80).trim() || "Untitled";
              break;
            }
          } catch {}
        }

        // Skip sessions with no meaningful title (only local-commands or empty)
        if (title !== "Untitled") {
          sessions.push({ id: sessionId, title, lastModified: stat.mtimeMs });
        }
      } catch {}
    }

    sessions.sort((a, b) => b.lastModified - a.lastModified);
  } catch {}

  return sessions;
}

export async function loadSessionHistory(
  projectPath: string,
  sessionId: string,
): Promise<any[]> {
  const sessionFile = join(getSessionsDir(projectPath), `${sessionId}.jsonl`);
  const messages: any[] = [];

  try {
    const { readFileSync } = require("fs");
    const content = readFileSync(sessionFile, "utf-8");
    const lines = content.trim().split("\n");
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (msg.type === "user" || msg.type === "assistant" || msg.type === "result") {
          // Normalize content: old format had string content, new has array
          if (msg.message?.content) {
            if (typeof msg.message.content === "string") {
              msg.message.content = [{ type: "text", text: msg.message.content }];
            }
            // Ensure content array items have the right shape
            if (Array.isArray(msg.message.content)) {
              msg.message.content = msg.message.content.map((block: any) => {
                if (typeof block === "string") {
                  return { type: "text", text: block };
                }
                return block;
              });
            }
          }
          // Skip Claude CLI local-command messages (internal, should never be shown)
          const blocks = msg.message?.content;
          if (Array.isArray(blocks) && blocks.some((b: any) =>
            b.type === "text" && typeof b.text === "string" &&
            /<\/?(?:local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/.test(b.text)
          )) {
            continue;
          }
          messages.push(msg);
        }
      } catch {}
    }
  } catch {}

  return messages;
}
