/**
 * SSH port used by bootstrap / session broker.
 * Production uses system OpenSSH (`ssh` / `scp`); tests inject a directory-backed or failing fake.
 */

import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { RemoteOperationError } from "../../shared/remote";
import { fingerprintSha256 } from "./known-hosts";

const execFileAsync = promisify(execFile);

export interface SshConnectInput {
  /** OpenSSH `Host` alias. System ssh uses this as the destination. */
  alias?: string;
  host: string;
  port: number;
  user?: string;
  identityFile?: string;
  /** Interactive only — never persist. */
  password?: string;
  agentSocket?: string;
  /** Called with the presented host-key fingerprint before auth. */
  onHostKey: (fingerprint: string) => "accept" | "unknown" | "mismatch";
}

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SshStdioPipe {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  close(): Promise<void>;
}

export interface SshSession {
  exec(command: string): Promise<SshExecResult>;
  sftpPut(localPath: string, remotePath: string): Promise<void>;
  sftpStat(remotePath: string): Promise<{ size: number } | null>;
  sftpRead(remotePath: string): Promise<string | null>;
  sftpWrite(remotePath: string, contents: string): Promise<void>;
  openStdio(command: string): Promise<SshStdioPipe>;
  /** RW-4: SSH -L to Host listen. Same-machine tests may net.connect. */
  openForwardedTcp?(remotePort: number): Promise<SshStdioPipe>;
  dispose(): Promise<void>;
}

export interface SshClient {
  connect(input: SshConnectInput): Promise<SshSession>;
}

export function createAuthFailSshClient(): SshClient {
  return {
    async connect() {
      throw new RemoteOperationError("ssh_auth", "Permission denied (publickey,password).");
    },
  };
}

/**
 * Treat a local directory as the remote `$HOME`.
 * Used by tests and the host-only (no SSH) path.
 */
export function createDirectoryBackedSshClient(remoteHome: string): SshClient {
  const root = resolve(remoteHome);
  return {
    async connect(input) {
      const presented = fingerprintSha256(Buffer.from(`dir:${root}`, "utf8"));
      const decision = input.onHostKey(presented);
      if (decision === "unknown") {
        throw new RemoteOperationError("host_key_unknown", "Unknown SSH host key.", {
          host: input.host,
          port: input.port,
          fingerprint: presented,
        });
      }
      if (decision === "mismatch") {
        throw new RemoteOperationError("host_key_mismatch", "SSH host key does not match.", {
          host: input.host,
          port: input.port,
          fingerprint: presented,
        });
      }
      return new DirectorySshSession(root);
    },
  };
}

class DirectorySshSession implements SshSession {
  constructor(private readonly root: string) {}

  private resolveRemote(remotePath: string): string {
    const normalized = remotePath.replace(/\\/g, "/");
    if (normalized === this.root || normalized.startsWith(`${this.root}/`)) {
      return normalized;
    }
    if (normalized.startsWith("~/")) return join(this.root, normalized.slice(2));
    if (normalized.startsWith("/")) {
      throw new RemoteOperationError("protocol", `refusing path outside fake home: ${remotePath}`);
    }
    return join(this.root, normalized);
  }

  async exec(command: string): Promise<SshExecResult> {
    try {
      const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
        cwd: this.root,
        env: { ...process.env, HOME: this.root },
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      return { stdout: String(stdout), stderr: String(stderr), code: 0 };
    } catch (err) {
      const failure = err as { stdout?: string; stderr?: string; code?: number | string };
      return {
        stdout: String(failure.stdout ?? ""),
        stderr: String(failure.stderr ?? (err instanceof Error ? err.message : String(err))),
        code: typeof failure.code === "number" ? failure.code : 1,
      };
    }
  }

  async sftpPut(localPath: string, remotePath: string): Promise<void> {
    const dest = this.resolveRemote(remotePath);
    mkdirSync(dirname(dest), { recursive: true });
    await pipeline(createReadStream(localPath), createWriteStream(dest));
  }

  async sftpStat(remotePath: string): Promise<{ size: number } | null> {
    try {
      const st = statSync(this.resolveRemote(remotePath));
      return { size: st.size };
    } catch {
      return null;
    }
  }

  async sftpRead(remotePath: string): Promise<string | null> {
    const { readFileSync } = await import("node:fs");
    try {
      return readFileSync(this.resolveRemote(remotePath), "utf8");
    } catch {
      return null;
    }
  }

  async sftpWrite(remotePath: string, contents: string): Promise<void> {
    const { writeFileSync } = await import("node:fs");
    const dest = this.resolveRemote(remotePath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, contents, "utf8");
  }

  async openStdio(command: string): Promise<SshStdioPipe> {
    const { spawn } = await import("node:child_process");
    const child = spawn("/bin/sh", ["-c", command], {
      cwd: this.root,
      env: { ...process.env, HOME: this.root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new RemoteOperationError("host_runtime", "failed to open host stdio pipes");
    }
    return {
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      close: async () => {
        if (!child.killed) child.kill("SIGTERM");
      },
    };
  }

  async dispose(): Promise<void> {}
}
