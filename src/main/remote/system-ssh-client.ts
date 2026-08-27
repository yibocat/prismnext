/**
 * Production SSH: the user's OpenSSH (`ssh` / `scp` / `ssh-keyscan`).
 * Auth, ProxyJump, IdentityFile, and known_hosts all come from `~/.ssh`.
 */

import { execFile, execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { RemoteOperationError } from "../../shared/remote";
import { fingerprintSha256 } from "./known-hosts";
import type { SshClient, SshConnectInput, SshExecResult, SshSession, SshStdioPipe } from "./ssh-client";

const execFileAsync = promisify(execFile);
const SSH_TIMEOUT_MS = 20_000;

function sshDestination(input: Pick<SshConnectInput, "alias" | "host">): string {
  return input.alias?.trim() || input.host;
}

function batchArgs(): string[] {
  return [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "StrictHostKeyChecking=yes",
  ];
}

/**
 * OpenSSH joins every argv after the destination into one remote command string.
 * The script must therefore be a single argument — `ssh dest -- sh -c printf %s "$HOME"`
 * becomes `sh -c printf` on the server and `$HOME` never prints.
 */
export function systemSshArgv(dest: string, remoteCommand: string): string[] {
  return [...batchArgs(), "--", dest, remoteCommand];
}

/**
 * Parse `wc -c` from a remote `sftpStat`.
 * A missing file must not become `{ size: 0 }`: `Number("") === 0`, and
 * `if [ -e p ]; then wc; fi` still exits 0 when the file is absent.
 */
export function parseRemoteStatStdout(code: number, stdout: string): { size: number } | null {
  if (code !== 0) return null;
  const text = stdout.trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return { size: n };
}

export function classifySshError(
  stderr: string,
  code: number | string | null,
): "ssh_auth" | "ssh_missing" | "ssh_jump" | "host_key_unknown" | "host_key_mismatch" | "host_runtime" {
  const text = stderr.toLowerCase();
  if (
    text.includes("enoent")
    || text.includes("not found")
    || text.includes("no such file")
    || (typeof code === "string" && code === "ENOENT")
  ) {
    return "ssh_missing";
  }
  if (
    text.includes("proxyjump")
    || text.includes("proxycommand")
    || text.includes("channel 0: open failed")
    || (text.includes("unable to connect to") && text.includes("jump"))
    || text.includes("kex_exchange_identification")
  ) {
    return "ssh_jump";
  }
  if (text.includes("identification has changed") || (text.includes("host key for") && text.includes("has changed"))) {
    return "host_key_mismatch";
  }
  if (text.includes("host key verification failed") || text.includes("not known and you have requested strict checking")) {
    return "host_key_unknown";
  }
  if (text.includes("permission denied") || text.includes("authentication failed") || text.includes("too many authentication")) {
    return "ssh_auth";
  }
  if (code === 255) return "host_runtime";
  return "host_runtime";
}

async function runSsh(
  dest: string,
  remoteCommand: string,
  extra: { input?: string; timeout?: number } = {},
): Promise<SshExecResult> {
  const args = systemSshArgv(dest, remoteCommand);
  if (extra.input == null) {
    try {
      const { stdout, stderr } = await execFileAsync("ssh", args, {
        timeout: extra.timeout ?? SSH_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      return { stdout: String(stdout), stderr: String(stderr), code: 0 };
    } catch (err) {
      const failure = err as { stdout?: string; stderr?: string; code?: number | string };
      const nodeCode = err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
      return {
        stdout: String(failure.stdout ?? ""),
        stderr: String(
          failure.stderr
          || (nodeCode === "ENOENT" ? "spawn ssh ENOENT" : "")
          || (err instanceof Error ? err.message : String(err)),
        ),
        code: typeof failure.code === "number" ? failure.code : 255,
      };
    }
  }

  return new Promise((resolve) => {
    const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, extra.timeout ?? SSH_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, code: 255 });
    });
    child.stdin.write(extra.input);
    child.stdin.end();
  });
}

export async function scanHostKeyFingerprint(host: string, port: number): Promise<string | null> {
  try {
    const args = port === 22 ? [host] : ["-p", String(port), host];
    const { stdout } = await execFileAsync("ssh-keyscan", ["-T", "8", ...args], {
      timeout: 12_000,
      maxBuffer: 1024 * 1024,
    });
    const line = String(stdout)
      .split(/\r?\n/)
      .find((item) => item.trim() && !item.startsWith("#"));
    if (!line) return null;
    const parts = line.split(/\s+/);
    const b64 = parts[2];
    if (!b64) return null;
    return fingerprintSha256(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

export function appendOpenSshKnownHost(host: string, port: number): void {
  const args = port === 22 ? [host] : ["-p", String(port), host];
  const stdout = execFileSync("ssh-keyscan", ["-T", "8", ...args], {
    timeout: 12_000,
    encoding: "utf8",
  });
  const lines = stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"));
  if (lines.length === 0) {
    throw new RemoteOperationError("host_key_unknown", "ssh-keyscan returned no host keys.");
  }
  const sshDir = join(homedir(), ".ssh");
  mkdirSync(sshDir, { recursive: true });
  appendFileSync(join(sshDir, "known_hosts"), `${lines.join("\n")}\n`, "utf8");
}

export function createSystemSshClient(): SshClient {
  return {
    async connect(input) {
      const dest = sshDestination(input);
      const probe = await runSsh(dest, "true");
      if (probe.code !== 0) {
        const kind = classifySshError(probe.stderr, probe.code);
        if (kind === "host_key_unknown" || kind === "host_key_mismatch") {
          const fingerprint = (await scanHostKeyFingerprint(input.host, input.port)) ?? "unknown";
          const decision = input.onHostKey(fingerprint);
          const code = kind === "host_key_mismatch" ? "host_key_mismatch" : decision === "mismatch" ? "host_key_mismatch" : "host_key_unknown";
          throw new RemoteOperationError(
            code,
            kind === "host_key_mismatch"
              ? "SSH host key does not match ~/.ssh/known_hosts."
              : "Unknown SSH host key.",
            { host: input.host, port: input.port, fingerprint },
          );
        }
        if (kind === "ssh_auth") {
          throw new RemoteOperationError("ssh_auth", probe.stderr.trim() || "Permission denied.");
        }
        if (kind === "ssh_missing") {
          throw new RemoteOperationError(
            "ssh_missing",
            "OpenSSH `ssh` is not on this computer’s PATH. Install it, then connect again.",
          );
        }
        if (kind === "ssh_jump") {
          throw new RemoteOperationError(
            "ssh_jump",
            probe.stderr.trim() || "SSH jump host failed. Check ProxyJump / ProxyCommand in ~/.ssh/config.",
          );
        }
        throw new RemoteOperationError("host_runtime", probe.stderr.trim() || `ssh exited ${probe.code}`);
      }
      return new SystemSshSession(dest);
    },
  };
}

class SystemSshSession implements SshSession {
  constructor(private readonly dest: string) {}

  async exec(command: string, extra?: { timeoutMs?: number }): Promise<SshExecResult> {
    return runSsh(this.dest, command, { timeout: extra?.timeoutMs ?? 60_000 });
  }

  async sftpPut(localPath: string, remotePath: string): Promise<void> {
    try {
      await execFileAsync("scp", [...batchArgs(), "--", localPath, `${this.dest}:${remotePath}`], {
        timeout: 120_000,
      });
    } catch (err) {
      const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
      throw new RemoteOperationError("host_runtime", stderr || (err instanceof Error ? err.message : "scp failed"));
    }
  }

  async sftpStat(remotePath: string): Promise<{ size: number } | null> {
    const quoted = shellQuote(remotePath);
    const result = await this.exec(
      `if [ -f ${quoted} ]; then wc -c < ${quoted}; else exit 1; fi`,
    );
    return parseRemoteStatStdout(result.code, result.stdout);
  }

  async sftpRead(remotePath: string): Promise<string | null> {
    const result = await this.exec(`cat ${shellQuote(remotePath)}`);
    if (result.code !== 0) return null;
    return result.stdout;
  }

  async sftpWrite(remotePath: string, contents: string): Promise<void> {
    const dir = remotePath.replace(/\/+$/, "").replace(/\/[^/]+$/, "") || ".";
    const mkdir = await this.exec(`mkdir -p ${shellQuote(dir)}`);
    if (mkdir.code !== 0) {
      throw new RemoteOperationError("host_runtime", mkdir.stderr || "mkdir failed");
    }
    const write = await runSsh(this.dest, `cat > ${shellQuote(remotePath)}`, {
      input: contents,
      timeout: 30_000,
    });
    if (write.code !== 0) {
      throw new RemoteOperationError("host_runtime", write.stderr || "remote write failed");
    }
  }

  async openForwardedTcp(remotePort: number): Promise<SshStdioPipe> {
    const { createServer } = await import("node:net");
    const localPort = await new Promise<number>((resolve, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const addr = probe.address();
        const port = addr && typeof addr === "object" ? addr.port : 0;
        probe.close(() => resolve(port));
      });
    });
    const child = spawn("ssh", [
      ...batchArgs(),
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-L",
      `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
      "--",
      this.dest,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const { waitForTcp, tcpPipe } = await import("./host-listen");
    try {
      await waitForTcp(localPort);
    } catch (err) {
      child.kill("SIGTERM");
      throw new RemoteOperationError(
        "host_runtime",
        err instanceof Error ? err.message : "SSH local forward did not come up.",
      );
    }
    const pipe = await tcpPipe(localPort);
    return {
      stdin: pipe.stdin,
      stdout: pipe.stdout,
      stderr: child.stderr ?? pipe.stderr,
      close: async () => {
        await pipe.close();
        if (!child.killed) child.kill("SIGTERM");
      },
    };
  }

  async openStdio(command: string): Promise<SshStdioPipe> {
    const child = spawn("ssh", systemSshArgv(this.dest, command), {
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new RemoteOperationError("host_runtime", "failed to open ssh stdio pipes");
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
