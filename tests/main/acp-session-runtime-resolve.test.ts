/**
 * Task child sessions live in the project OpenCode runtime DB. Before they are
 * registered in chat-session-registry, getInstanceForSession must still resolve
 * to that project runtime — not the global opencode-server singleton.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => join(tmpdir(), "prism-acp-session-resolve-userdata"),
  },
}));

vi.mock("electron-store", () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {}
    store = {};
  },
}));

import { AcpService } from "../../src/main/acp/service";
import { getSessionProjectRoot } from "../../src/main/services/chat-session-registry";

function seedSessionDb(dbPath: string, sessionId: string, parentId?: string): void {
  mkdirSync(join(dbPath, ".."), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project (
        id text PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS session (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        parent_id text,
        slug text NOT NULL,
        directory text NOT NULL,
        title text NOT NULL,
        version text NOT NULL,
        cost real DEFAULT 0 NOT NULL,
        tokens_input integer DEFAULT 0 NOT NULL,
        tokens_output integer DEFAULT 0 NOT NULL,
        tokens_reasoning integer DEFAULT 0 NOT NULL,
        tokens_cache_read integer DEFAULT 0 NOT NULL,
        tokens_cache_write integer DEFAULT 0 NOT NULL,
        time_created integer NOT NULL,
        time_updated integer NOT NULL,
        time_archived integer
      );
    `);
    db.prepare("INSERT OR IGNORE INTO project (id) VALUES (?)").run("proj-1");
    db.prepare(
      `INSERT INTO session (
        id, project_id, parent_id, slug, directory, title, version,
        time_created, time_updated
      ) VALUES (?, 'proj-1', ?, 'slug', '/tmp', 't', '1', 1, 1)`,
    ).run(sessionId, parentId ?? null);
  } finally {
    db.close();
  }
}

describe("AcpService.getInstanceForSession project-runtime probe", () => {
  let projectRoot: string;

  beforeEach(() => {
    AcpService.__resetProjectRuntimesForTests();
    AcpService.setSessionProjectRootResolver(getSessionProjectRoot);
    projectRoot = mkdtempSync(join(tmpdir(), "prism-proj-"));
  });

  afterEach(() => {
    AcpService.__resetProjectRuntimesForTests();
    AcpService.setSessionProjectRootResolver(() => undefined);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("resolves unregistered child session to the project runtime that owns it", () => {
    const project = AcpService.getInstanceForProject(projectRoot);
    const dbPath = join((project as any).getServerDataDir(), "opencode", "opencode.db");
    seedSessionDb(dbPath, "ses_child_1", "ses_parent_1");

    expect(getSessionProjectRoot("ses_child_1")).toBeUndefined();

    const resolved = AcpService.getInstanceForSession("ses_child_1");
    expect(resolved).toBe(project);
    expect(getSessionProjectRoot("ses_child_1")).toBe(projectRoot);
    expect(resolved.getSessionParentId("ses_child_1")).toBe("ses_parent_1");
  });

});
