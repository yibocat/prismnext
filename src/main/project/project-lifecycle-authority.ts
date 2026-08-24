import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { homedir } from "node:os";

export interface ProjectLifecycleFs {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}

export interface ProjectOpenTransition {
  rootPath: string;
  previousRoot: string | null;
  changed: boolean;
}

export interface ProjectLifecycleAuthorityOptions {
  homeDir?: string;
  fs?: ProjectLifecycleFs;
}

const defaultFs: ProjectLifecycleFs = { realpath, stat };

function isNestedPath(child: string, parent: string): boolean {
  const pathRelative = relative(parent, child);
  return Boolean(pathRelative) && !pathRelative.startsWith("..") && !isAbsolute(pathRelative);
}

/**
 * The only authority allowed to grant a project root to lifecycle-sensitive
 * services such as the filesystem watcher. It retains one canonical root.
 */
export class ProjectLifecycleAuthority {
  private readonly homeDir: string;
  private readonly fs: ProjectLifecycleFs;
  private activeRoot: string | null = null;

  constructor(options: ProjectLifecycleAuthorityOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
    this.fs = options.fs ?? defaultFs;
  }

  get currentRoot(): string | null {
    return this.activeRoot;
  }

  async resolveRoot(rootPath: string): Promise<string> {
    if (!rootPath || typeof rootPath !== "string" || !isAbsolute(rootPath)) {
      throw new Error("Project root must be an absolute path");
    }

    let canonicalHome: string;
    let canonicalRoot: string;
    try {
      [canonicalHome, canonicalRoot] = await Promise.all([
        this.fs.realpath(this.homeDir),
        this.fs.realpath(rootPath),
      ]);
    } catch {
      throw new Error(`Project root is missing: ${rootPath}`);
    }

    let rootStat: { isDirectory(): boolean };
    try {
      rootStat = await this.fs.stat(canonicalRoot);
    } catch {
      throw new Error(`Project root is missing: ${rootPath}`);
    }
    if (!rootStat.isDirectory()) {
      throw new Error(`Project root must be a directory: ${rootPath}`);
    }
    if (!isNestedPath(canonicalRoot, canonicalHome)) {
      throw new Error(`Project root is outside the user home: ${rootPath}`);
    }

    return canonicalRoot;
  }

  activate(rootPath: string): ProjectOpenTransition {
    const previousRoot = this.activeRoot;
    const changed = previousRoot !== rootPath;
    this.activeRoot = rootPath;
    return { rootPath, previousRoot, changed };
  }

  async open(rootPath: string): Promise<ProjectOpenTransition> {
    return this.activate(await this.resolveRoot(rootPath));
  }

  close(): string | null {
    const previousRoot = this.activeRoot;
    this.activeRoot = null;
    return previousRoot;
  }
}

export const projectLifecycleAuthority = new ProjectLifecycleAuthority();
