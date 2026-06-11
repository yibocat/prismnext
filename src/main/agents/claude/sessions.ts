import type { SessionProvider, SessionInfo } from "../types";
import { readdir, unlink, mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createLogger } from "../../services/logger";

const log = createLogger("claude-sessions", "agent");

interface SessionIndex {
  [sessionId: string]: {
    title: string;
    createdAt: number;
    lastModified: number;
    messageCount: number;
  };
}

function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, "-");
}

function getOldSessionsDir(projectPath: string): string {
  const encoded = encodeProjectPath(projectPath);
  return join(homedir(), ".claude", "projects", encoded);
}

export class ClaudeSessionProvider implements SessionProvider {
  private projectRoot: string | null = null;

  setProjectRoot(path: string): void {
    this.projectRoot = path;
  }

  private getSessionsDir(): string {
    if (!this.projectRoot) throw new Error("setProjectRoot not called");
    return join(this.projectRoot, ".prismnext", "sessions", "claude");
  }

  private getIndexPath(): string {
    return join(this.getSessionsDir(), "index.json");
  }

  private async ensureDir(): Promise<void> {
    const dir = this.getSessionsDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  private async readIndex(): Promise<SessionIndex> {
    const indexPath = this.getIndexPath();
    if (!existsSync(indexPath)) return {};
    try {
      const raw = await readFile(indexPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async writeIndex(index: SessionIndex): Promise<void> {
    await this.ensureDir();
    await writeFile(this.getIndexPath(), JSON.stringify(index, null, 2), "utf-8");
  }

  private async migrateFromOldPath(): Promise<void> {
    if (!this.projectRoot) return;

    // Don't re-run migration if it already completed. Without this guard,
    // deleting the last session from .prismnext/sessions/claude/ would
    // trigger a fresh migration and resurrect every old session.
    const migrationMarker = join(this.getSessionsDir(), ".migration-done");
    if (existsSync(migrationMarker)) return;

    const oldDir = getOldSessionsDir(this.projectRoot);
    if (!existsSync(oldDir)) return;

    const newDir = this.getSessionsDir();
    if (existsSync(newDir)) {
      const existing = await readdir(newDir);
      if (existing.some((f) => f.endsWith(".jsonl"))) return; // Already has data
    }

    // Copy JSONL files from old path to new path
    try {
      await this.ensureDir();
      const entries = await readdir(oldDir, { withFileTypes: true });
      const jsonlFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".jsonl"));

      let migrated = 0;
      for (const f of jsonlFiles) {
        const oldPath = join(oldDir, f.name);
        const newPath = join(newDir, f.name);
        await copyFile(oldPath, newPath);
        migrated++;
      }
      // Write marker AFTER successful migration — prevents re-migration
      await writeFile(migrationMarker, String(Date.now()), "utf-8");
      if (migrated > 0) {
        log.info(`Migrated ${migrated} sessions from ${oldDir} to ${newDir}`);
      }
    } catch (err) {
      log.error(`Migration from ${oldDir} failed`, err);
      // Don't throw — continue with empty session list rather than crashing sidebar
    }
  }

  async listSessions(): Promise<SessionInfo[]> {
    if (!this.projectRoot) return [];

    // Migrate from old path on first access
    await this.migrateFromOldPath();

    await this.ensureDir();
    const dir = this.getSessionsDir();
    const entries = await readdir(dir, { withFileTypes: true });
    const jsonlFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith(".jsonl")
    );

    const index = await this.readIndex();
    const sessions: SessionInfo[] = [];

    for (const f of jsonlFiles) {
      const sessionId = f.name.replace(/\.jsonl$/, "");
      const filePath = join(dir, f.name);
      const stat = statSync(filePath);

      const cached = index[sessionId];
      let title = cached?.title || "Untitled";
      const createdAt = cached?.createdAt || stat.birthtimeMs;

      // Extract title from the first user message in the JSONL when:
      // - Not yet in the index (first scan), OR
      // - Previous extraction failed ("Untitled") — the user message may
      //   have been appended after the initial scan (e.g. prewarm creates
      //   the JSONL with only system messages, user message arrives later).
      if (!cached || title === "Untitled") {
        try {
          const stream = createReadStream(filePath, { encoding: "utf-8" });
          const rl = createInterface({ input: stream, crlfDelay: Infinity });
          for await (const line of rl) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === "user" && msg.message?.content) {
                // content can be a string (Claude CLI native format) or an
                // array of content blocks (Anthropic API / streaming format).
                const raw = msg.message.content;
                let extracted: string | null = null;
                if (typeof raw === "string") {
                  extracted = raw;
                } else if (Array.isArray(raw)) {
                  extracted = raw
                    .filter((b: any) => b.type === "text" && b.text)
                    .map((b: any) => b.text)
                    .join(" ");
                }
                if (extracted) {
                  title = extracted.replace(/<[^>]+>/g, "").trim().slice(0, 40);
                  break;
                }
              }
            } catch { continue; }
          }
          stream.close();
        } catch { /* keep default title */ }

        // Update index — preserve existing fields, only add/update title
        index[sessionId] = {
          title,
          createdAt: cached?.createdAt ?? stat.birthtimeMs,
          lastModified: stat.mtimeMs,
          messageCount: cached?.messageCount ?? 0,
        };
      }

      sessions.push({
        id: sessionId,
        title,
        lastModified: stat.mtimeMs,
        createdAt,
        agentId: "claude",
        agentName: "Claude Code",
      });
    }

    // Persist updated index
    await this.writeIndex(index);

    return sessions.sort((a, b) => b.lastModified - a.lastModified);
  }

  async loadSession(sessionId: string): Promise<any[]> {
    if (!this.projectRoot) return [];
    const filePath = join(this.getSessionsDir(), `${sessionId}.jsonl`);
    if (!existsSync(filePath)) return [];

    const messages: any[] = [];
    const stream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "system") continue;

        // ── Normalize content to ContentBlock[] ──
        // Claude CLI native format: content is a plain string.
        // Streaming / Anthropic API format: content is an array of blocks.
        // We normalize here so the renderer always receives ContentBlock[].
        if (msg.message?.content) {
          const raw = msg.message.content;
          if (typeof raw === "string") {
            msg.message.content = [{ type: "text", text: raw }];
          } else if (Array.isArray(raw)) {
            msg.message.content = raw.map((block: any) => {
              if (typeof block === "string") {
                return { type: "text", text: block };
              }
              return block;
            });
          }
        }

        if (!msg.message?.content || msg.message.content.length === 0) {
          if (msg.type !== "result") continue;
        }
        messages.push(msg);
      } catch { continue; }
    }
    stream.close();
    return messages;
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.projectRoot) return;
    const filePath = join(this.getSessionsDir(), `${sessionId}.jsonl`);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
    const index = await this.readIndex();
    delete index[sessionId];
    await this.writeIndex(index);
  }
}
