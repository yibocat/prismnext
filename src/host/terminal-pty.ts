import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir as tmpdirSync } from "node:os";
import { join } from "node:path";

export type HostPtyBackend = "linux-ptmx" | "linux-script" | "darwin-relay" | "pipe";

export interface HostPty {
  pid: number;
  shell: string;
  backend: HostPtyBackend;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(handler: (chunk: string) => void): void;
  onExit(handler: (code: number) => void): void;
  /**
   * Optional readiness signal (darwin-relay): fires once the PTY is live and
   * pre-ready writes have been flushed. Other backends are ready at spawn.
   */
  onReady?(handler: () => void): void;
}

/** Linux `TIOCSPTLCK` / `TIOCGPTN` — same encoding on x64 and arm64. */
const TIOCSPTLCK = 0x40045431;
const TIOCGPTN = 0x80045430;

/**
 * Darwin ioctls (values verified against macOS `sys/ttycom.h` via clang):
 * grantpt + unlockpt the ptmx slave, query its /dev/ttysN name, set winsize.
 */
const TIOCPTYGRANT_DARWIN = 0x20007454;
const TIOCPTYUNLK_DARWIN = 0x20007452;
const TIOCPTYGNAME_DARWIN = 0x40807453;
const TIOCSWINSZ_DARWIN = 0x80087467;

const DARWIN_PTY_RELAY_PERL = [
  // grantpt AND unlockpt are both required: the slave stays EAGAIN-locked
  // until both run. The original helper issued only TIOCPTYGRANT believing it
  // was the unlock — the slave never opened, the shell silently fell back to
  // plain pipes, and raced the relay for stdin bytes (intermittent command
  // loss / missing CRLF). Values verified against macOS ttycom.h via clang.
  `my $TIOCPTYGRANT = ${TIOCPTYGRANT_DARWIN};`,
  `my $TIOCPTYUNLK = ${TIOCPTYUNLK_DARWIN};`,
  `my $TIOCPTYGNAME = ${TIOCPTYGNAME_DARWIN};`,
  `my $TIOCSWINSZ = ${TIOCSWINSZ_DARWIN};`,
  "my ($shell, $cwd) = @ARGV;",
  "open(my $master, '+>', '/dev/ptmx') or exit 10;",
  "my $ubuf = chr(0) x 256;",
  "ioctl($master, $TIOCPTYGRANT, $ubuf) or exit 11;",
  "ioctl($master, $TIOCPTYUNLK, $ubuf) or exit 18;",
  "my $nbuf = chr(0) x 128;",
  "ioctl($master, $TIOCPTYGNAME, $nbuf) or exit 12;",
  "my $slave = unpack('Z128', $nbuf);",
  "my $S; for (1..40) { last if sysopen($S, $slave, 2); select(undef,undef,undef,0.05); }",
  // A failed sysopen leaves the glob truthy — guard on the fd, not the handle.
  "exit 13 unless defined fileno($S);",
  // Real winsize on the tty (the old `system('stty', ...)` ran with a pipe
  // stdin and never applied anything).
  "ioctl($S, $TIOCSWINSZ, pack('S4', $ENV{PTY_ROWS} || 24, $ENV{PTY_COLS} || 80, 0, 0));",
  "my $pid = fork(); exit 14 unless defined $pid;",
  // Child: fresh-open the slave (session leader + no ctty yet → the tty
  // becomes our controlling terminal) with retries, then dup onto stdio. A
  // single un-retried sysopen raced the unlock window and left the shell on
  // the inherited pipes.
  "if ($pid == 0) { syscall(147); my $T; for (1..40) { last if sysopen($T, $slave, 2); select(undef,undef,undef,0.025); } exit 17 unless defined fileno($T); open(STDIN, '<&', $T); open(STDOUT, '>&', $T); open(STDERR, '>&', $T); chdir($cwd) or exit 15; exec($shell, '-f', '-i') or exit 16; }",
  "close($S);",
  "$| = 1; # unbuffered — the Host gates writes on this READY line",
  "print \"READY pid=$pid\\n\";",
  "binmode(STDIN); binmode(STDOUT);",
  "my $rin = ''; vec($rin, fileno(STDIN), 1) = 1;",
  "my $dead = 0; $SIG{TERM} = sub { $dead = 1; kill 'TERM', $pid; }; $SIG{CHLD} = sub { $dead = 1; };",
  "while (!$dead) {",
  "  my $r = $rin; vec($r, fileno($master), 1) = 1;",
  "  my $n = select(my $rout = $r, undef, undef, 0.5);",
  "  last if $dead;",
  "  if ($n && $n > 0) {",
  "    if (vec($rout, fileno($master), 1)) { my $b=''; my $rd; for (1..10) { $rd = sysread($master, $b, 8192); last if defined $rd || !$!{EINTR}; } last if !defined $rd || $rd == 0; my $off=0; while ($off < length($b)) { my $w = syswrite(STDOUT, $b, length($b)-$off, $off); last unless defined $w; $off += $w; } }",
  "    if (vec($rout, fileno(STDIN), 1)) { my $b=''; my $rd; for (1..10) { $rd = sysread(STDIN, $b, 8192); last if defined $rd || !$!{EINTR}; } if (!defined $rd || $rd == 0) { vec($rin, fileno(STDIN), 1) = 0; next; } my $off=0; my $g=0; while ($off < length($b) && $g++ < 100) { my $w = syswrite($master, $b, length($b)-$off, $off); if (defined $w) { $off += $w; } elsif (!$!{EINTR}) { last; } } }",
  "  }",
  "  waitpid($pid, 1);",
  "}",
  "kill 'TERM', $pid;",
].join("\n");

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
  try {
    const darwin = spawnDarwinPtyRelay(cwd, shell, cols, rows);
    if (darwin) return wrapCrlf(darwin);
  } catch {
    // fall through
  }
  return wrapCrlf(spawnPipeShell(cwd, shell, cols, rows));
}

let darwinRelaySeq = 0;

/**
 * macOS backend. The Host cannot unlock ptmx itself (no ioctl; `script(1)`
 * refuses a non-TTY stdin), and `/bin/zsh -i` over plain pipes never executes
 * commands (zsh buffers until stdin closes). A small system perl allocates the
 * PTY, spawns the shell with a controlling tty, and relays master↔stdio.
 * Requires no non-core modules (plain ioctls; setsid via syscall(147)).
 */
function spawnDarwinPtyRelay(
  cwd: string,
  shell: string,
  cols: number,
  rows: number,
): HostPty | null {
  if (process.platform !== "darwin") return null;
  const perl = findOnPath("perl") ?? "/usr/bin/perl";
  // Write the helper to a temp file and run THAT. `perl -e` proved unreliable
  // here: identical script+argv works from a file but the -e variant came up
  // READY-with-dead-relay under some environments (script truncated/behaved
  // differently). A file sidesteps the whole class of -e quirks.
  // Path is unique per spawn: a shared per-process path let one spawn's
  // cleanup delete the file another spawn had just written but perl had not
  // read yet (slow exec under load) — the helper then died before READY.
  const helperPath = join(
    tmpdirSync(),
    `prism-pty-relay-${process.pid}-${++darwinRelaySeq}.pl`,
  );
  try {
    writeFileSync(helperPath, DARWIN_PTY_RELAY_PERL, { mode: 0o600 });
  } catch {
    return null;
  }
  const child = spawn(perl, [helperPath, shell, cwd], {
    cwd,
    env: {
      ...ttyEnv(cwd, cols, rows),
      PTY_COLS: String(Math.max(2, cols)),
      PTY_ROWS: String(Math.max(2, rows)),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Helper is self-contained — unlink once perl has had the file open. The
  // window between spawn() and perl's open() can exceed a second under load,
  // so a short fixed timer raced later spawns; tie cleanup to child exit and
  // keep only a long unref'd fallback for never-exiting sessions.
  const cleanupHelper = () => {
    try {
      rmSync(helperPath, { force: true });
    } catch {
      // ignore
    }
  };
  child.on("exit", cleanupHelper);
  const unlinkTimer = setTimeout(cleanupHelper, 30_000);
  unlinkTimer.unref?.();
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");

  let dataHandler: (chunk: string) => void = () => undefined;
  let exitHandler: (code: number) => void = () => undefined;
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    exitHandler(code ?? 0);
  });

  // The helper's zsh needs a moment after READY before its tty accepts input:
  // a write issued in that window is swallowed (observed: first write lost even
  // seconds later, while any subsequent write works). Hold writes until the
  // relay has settled, then flush in order.
  let ready = false;
  let readySettled = false;
  const readyHandlers: Array<() => void> = [];
  let buffered = "";
  const pendingWrites: string[] = [];
  const flushPending = () => {
    while (pendingWrites.length > 0) {
      child.stdin?.write(pendingWrites.shift()!);
    }
  };
  child.stdout!.on("data", (chunk: string) => {
    if (!ready) {
      buffered += chunk;
      const lineEnd = buffered.indexOf("\n");
      if (lineEnd < 0) return;
      const first = buffered.slice(0, lineEnd);
      buffered = buffered.slice(lineEnd + 1);
      if (!first.startsWith("READY")) {
        exited = true;
        exitHandler(1);
        return;
      }
      ready = true;
      if (buffered) dataHandler(buffered);
      // Give the helper's select loop a moment to come up, then flush
      // pre-READY writes and signal readiness. (Immediate flush lost the
      // first write; a 250ms settle empirically clears the startup window.)
      setTimeout(() => {
        readySettled = true;
        flushPending();
        for (const handler of readyHandlers.splice(0)) handler();
      }, 250);
      return;
    }
    dataHandler(chunk);
  });
  child.stderr?.on("data", (chunk: string) => {
    if (!ready) {
      // Helper died before the PTY was up — surface as exit.
      if (!exited && !child.stdout!.readableLength) {
        // Defer: stdout 'end' will fire the exit path; stderr only logs.
      }
    }
  });

  return {
    pid: child.pid ?? 0,
    shell,
    backend: "darwin-relay",
    write(data) {
      if (exited) return;
      // Before the relay settles, queue — the settle timer flushes in order.
      if (!readySettled) {
        pendingWrites.push(data);
        return;
      }
      child.stdin?.write(data);
    },
    resize() {
      // The relayed TTY keeps its spawn size; resizing needs a relay protocol
      // message. Acceptable: remote terminals rarely resize, and the fallback
      // pipe backend had the same limitation.
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
    onReady(handler) {
      if (ready) handler();
      else readyHandlers.push(handler);
    },
  };
}
