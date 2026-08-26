import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readdirSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

export type HostPtyBackend = "linux-ptmx" | "pipe";

export interface HostPty {
  pid: number;
  shell: string;
  backend: HostPtyBackend;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(handler: (chunk: string) => void): void;
  onExit(handler: (code: number) => void): void;
}

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const full = join(dir, name);
    if (existsSync(full)) return full;
  }
  return null;
}

export function resolveHostShell(): string {
  const fromEnv = process.env.SHELL;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return findOnPath("bash") ?? findOnPath("sh") ?? "/bin/sh";
}

function ttyEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    PWD: cwd,
  };
}

function attachStdio(child: ChildProcess, onData: (chunk: string) => void, onExit: (code: number) => void): void {
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => onData(chunk));
  child.stderr?.on("data", (chunk: string) => onData(chunk));
  child.on("exit", (code) => onExit(code ?? 0));
}

function applyStty(slavePath: string, cols: number, rows: number): void {
  const stty = findOnPath("stty");
  if (!stty) return;
  let fd = -1;
  try {
    fd = openSync(slavePath, "r+");
    spawn(stty, ["cols", String(Math.max(2, cols)), "rows", String(Math.max(2, rows))], {
      stdio: [fd, "ignore", "ignore"],
    }).unref();
  } catch {
    // winsize stays at the kernel default
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

function openLinuxMaster(): { master: number; slavePath: string } | null {
  if (process.platform !== "linux" || !existsSync("/dev/ptmx") || !existsSync("/dev/pts")) {
    return null;
  }
  let before: Set<string>;
  try {
    before = new Set(readdirSync("/dev/pts").filter((name) => /^\d+$/.test(name)));
  } catch {
    return null;
  }
  let master: number;
  try {
    master = openSync("/dev/ptmx", "r+");
  } catch {
    return null;
  }
  let appeared: string[];
  try {
    appeared = readdirSync("/dev/pts").filter((name) => /^\d+$/.test(name) && !before.has(name));
  } catch {
    closeSync(master);
    return null;
  }
  if (appeared.length === 0) {
    closeSync(master);
    return null;
  }
  const slavePath = `/dev/pts/${appeared[0]}`;
  try {
    const probe = openSync(slavePath, "r+");
    closeSync(probe);
  } catch {
    closeSync(master);
    return null;
  }
  return { master, slavePath };
}

function spawnLinuxPty(cwd: string, shell: string, cols: number, rows: number): HostPty | null {
  const opened = openLinuxMaster();
  if (!opened) return null;
  const { master, slavePath } = opened;
  applyStty(slavePath, cols, rows);

  let slaveFd: number;
  try {
    slaveFd = openSync(slavePath, "r+");
  } catch {
    closeSync(master);
    return null;
  }

  const setsid = findOnPath("setsid");
  const child = setsid
    ? spawn(setsid, ["-c", shell, "-i"], {
        cwd,
        env: ttyEnv(cwd),
        stdio: [slaveFd, slaveFd, slaveFd],
      })
    : spawn(shell, ["-i"], {
        cwd,
        env: ttyEnv(cwd),
        stdio: [slaveFd, slaveFd, slaveFd],
      });

  try {
    closeSync(slaveFd);
  } catch {
    // spawn owns the fd
  }

  const reader = createReadStream("", { fd: master, encoding: "utf8", autoClose: false });
  let dataHandler: (chunk: string) => void = () => undefined;
  let exitHandler: (code: number) => void = () => undefined;
  reader.on("data", (chunk: string | Buffer) => {
    dataHandler(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  });
  child.on("exit", (code) => {
    try {
      reader.destroy();
    } catch {
      // ignore
    }
    try {
      closeSync(master);
    } catch {
      // ignore
    }
    exitHandler(code ?? 0);
  });

  return {
    pid: child.pid ?? 0,
    shell,
    backend: "linux-ptmx",
    write(data) {
      try {
        writeSync(master, data);
      } catch {
        // closed
      }
    },
    resize(nextCols, nextRows) {
      applyStty(slavePath, nextCols, nextRows);
      try {
        child.kill("SIGWINCH");
      } catch {
        // ignore
      }
    },
    kill() {
      child.kill("SIGTERM");
    },
    onData(handler) {
      dataHandler = handler;
    },
    onExit(handler) {
      exitHandler = handler;
    },
  };
}

function spawnPipeShell(cwd: string, shell: string): HostPty {
  const child = spawn(shell, ["-i"], {
    cwd,
    env: ttyEnv(cwd),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let dataHandler: (chunk: string) => void = () => undefined;
  let exitHandler: (code: number) => void = () => undefined;
  attachStdio(child, (chunk) => dataHandler(chunk), (code) => exitHandler(code));
  return {
    pid: child.pid ?? 0,
    shell,
    backend: "pipe",
    write(data) {
      child.stdin?.write(data);
    },
    resize() {
      // pipes have no TTY winsize
    },
    kill() {
      child.kill("SIGTERM");
    },
    onData(handler) {
      dataHandler = handler;
    },
    onExit(handler) {
      exitHandler = handler;
    },
  };
}

/** Linux Host uses `/dev/ptmx`. No embedded helper scripts. */
export function spawnHostPty(cwd: string, cols = 80, rows = 24): HostPty {
  const shell = resolveHostShell();
  try {
    const linux = spawnLinuxPty(cwd, shell, cols, rows);
    if (linux) return linux;
  } catch {
    // fall through
  }
  return spawnPipeShell(cwd, shell);
}
