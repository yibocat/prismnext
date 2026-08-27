import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  readlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

export type HostPtyBackend = "linux-ptmx" | "linux-script" | "pipe";

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

/** Linux `TIOCSPTLCK` / `TIOCGPTN` — same encoding on x64 and arm64. */
const TIOCSPTLCK = 0x40045431;
const TIOCGPTN = 0x80045430;

/**
 * xterm treats LF as "down one row, stay in column". A real TTY's ONLCR
 * turns LF into CRLF. Pipe backends do not — translate before emit.
 */
export function createVtCrlfTranslator(): (chunk: string) => string {
  let lastWasCr = false;
  return (chunk: string) => {
    let out = "";
    for (const ch of chunk) {
      if (ch === "\n" && !lastWasCr) out += "\r";
      out += ch;
      lastWasCr = ch === "\r";
    }
    return out;
  };
}

export function ensureVtCrlf(chunk: string): string {
  return createVtCrlfTranslator()(chunk);
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

function ttyEnv(cwd: string, cols: number, rows: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    PWD: cwd,
    COLUMNS: String(Math.max(2, cols)),
    LINES: String(Math.max(2, rows)),
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

function resolvePerl(): string | null {
  if (existsSync("/usr/bin/perl")) return "/usr/bin/perl";
  return findOnPath("perl");
}

/**
 * After `open("/dev/ptmx")` the slave is locked. Opening it without
 * `unlockpt` fails, which used to drop us on a pipe (job control + staircase).
 * Host Node has no ioctl, so Debian/Ubuntu `perl-base` (essential) does it.
 */
export function unlockLinuxPtmx(masterFd: number): string | null {
  const perl = resolvePerl();
  if (!perl) return null;
  const result = spawnSync(
    perl,
    [
      "-e",
      [
        "open(F, '+<&=3') or die $!;",
        `defined ioctl(F, ${TIOCSPTLCK}, pack('i', 0)) or die $!;`,
        "my $n = pack('I', 0);",
        `defined ioctl(F, ${TIOCGPTN}, $n) or die $!;`,
        "print unpack('I', $n);",
      ].join(""),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe", masterFd],
    },
  );
  if (result.status !== 0) return null;
  const n = Number.parseInt(String(result.stdout).trim(), 10);
  if (!Number.isInteger(n) || n < 0) return null;
  const slavePath = `/dev/pts/${n}`;
  return existsSync(slavePath) ? slavePath : null;
}

function setsidSupportsCtty(setsid: string): boolean {
  const help = spawnSync(setsid, ["--help"], { encoding: "utf8" });
  const text = `${help.stdout}\n${help.stderr}`;
  return text.includes("--ctty") || /\s-c\b/.test(text);
}

function openLinuxMaster(): { master: number; slavePath: string } | null {
  if (process.platform !== "linux" || !existsSync("/dev/ptmx")) return null;
  let master: number;
  try {
    master = openSync("/dev/ptmx", "r+");
  } catch {
    return null;
  }
  const slavePath = unlockLinuxPtmx(master);
  if (!slavePath) {
    try {
      closeSync(master);
    } catch {
      // ignore
    }
    return null;
  }
  try {
    const probe = openSync(slavePath, "r+");
    closeSync(probe);
  } catch {
    try {
      closeSync(master);
    } catch {
      // ignore
    }
    return null;
  }
  return { master, slavePath };
}

function wrapCrlf(pty: HostPty): HostPty {
  const translate = createVtCrlfTranslator();
  const bind = pty.onData.bind(pty);
  return {
    ...pty,
    onData(handler) {
      bind((chunk) => handler(translate(chunk)));
    },
  };
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
  const child: ChildProcess = setsid && setsidSupportsCtty(setsid)
    ? spawn(setsid, ["-c", shell, "-i"], {
        cwd,
        env: ttyEnv(cwd, cols, rows),
        stdio: [slaveFd, slaveFd, slaveFd],
      })
    : spawn(shell, ["-i"], {
        cwd,
        env: ttyEnv(cwd, cols, rows),
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

function childPids(pid: number): number[] {
  try {
    const raw = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8");
    return raw.trim().split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function ptsFromPid(pid: number): string | null {
  for (const fd of [0, 1, 2]) {
    try {
      const target = readlinkSync(`/proc/${pid}/fd/${fd}`);
      if (target.startsWith("/dev/pts/")) return target;
    } catch {
      // try next
    }
  }
  return null;
}

function findScriptSlave(scriptPid: number): string | null {
  const kids = childPids(scriptPid);
  for (const kid of kids.length ? kids : [scriptPid]) {
    const pts = ptsFromPid(kid);
    if (pts) return pts;
  }
  return ptsFromPid(scriptPid);
}

/** util-linux / bsdutils `script` allocates a real TTY when ptmx unlock is unavailable. */
function spawnScriptPty(cwd: string, shell: string, cols: number, rows: number): HostPty | null {
  if (process.platform !== "linux") return null;
  const script = findOnPath("script");
  if (!script) return null;
  const child = spawn(script, ["-q", "-f", "-c", `${shell} -i`, "/dev/null"], {
    cwd,
    env: ttyEnv(cwd, cols, rows),
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!child.pid) return null;
  let slavePath: string | null = null;
  const refreshSlave = () => {
    slavePath = findScriptSlave(child.pid ?? 0);
    if (slavePath) applyStty(slavePath, cols, rows);
  };
  setTimeout(refreshSlave, 30);
  let dataHandler: (chunk: string) => void = () => undefined;
  let exitHandler: (code: number) => void = () => undefined;
  attachStdio(child, (chunk) => dataHandler(chunk), (code) => exitHandler(code));
  return {
    pid: child.pid,
    shell,
    backend: "linux-script",
    write(data) {
      child.stdin?.write(data);
    },
    resize(nextCols, nextRows) {
      if (!slavePath) refreshSlave();
      if (slavePath) applyStty(slavePath, nextCols, nextRows);
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

function spawnPipeShell(cwd: string, shell: string, cols: number, rows: number): HostPty {
  const child = spawn(shell, ["-i"], {
    cwd,
    env: ttyEnv(cwd, cols, rows),
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

/** Linux Host prefers `/dev/ptmx` (unlock + controlling tty). No python3. */
export function spawnHostPty(cwd: string, cols = 80, rows = 24): HostPty {
  const shell = resolveHostShell();
  try {
    const linux = spawnLinuxPty(cwd, shell, cols, rows);
    if (linux) return wrapCrlf(linux);
  } catch {
    // fall through
  }
  try {
    const viaScript = spawnScriptPty(cwd, shell, cols, rows);
    if (viaScript) return wrapCrlf(viaScript);
  } catch {
    // fall through
  }
  return wrapCrlf(spawnPipeShell(cwd, shell, cols, rows));
}
