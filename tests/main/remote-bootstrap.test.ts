import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as tarCreate } from "tar";
import { describe, expect, it } from "vitest";
import { ensureHostPayload } from "../../src/main/remote/bootstrap";
import { createDirectoryBackedSshClient } from "../../src/main/remote/ssh-client";
import { sha256File } from "../../src/main/remote/payload-path";

function writeStubBin(path: string, body = "#!/bin/sh\nexit 0\n"): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body, { mode: 0o755 });
}

const INSTALL_RUNTIME_STUB = `#!/bin/sh
set -eu
CURRENT=""
STEP="all"
while [ $# -gt 0 ]; do
  case "$1" in
    --current) CURRENT=$2; shift 2 ;;
    --step) STEP=$2; shift 2 ;;
    --arch) shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$CURRENT/bin" "$CURRENT/vendor/git/bin"
if [ "$STEP" = "node" ] || [ "$STEP" = "all" ]; then
  printf '%s\\n' '#!/bin/sh' 'echo v24.19.0' > "$CURRENT/bin/node"
  chmod +x "$CURRENT/bin/node"
fi
if [ "$STEP" = "git" ] || [ "$STEP" = "all" ]; then
  printf '%s\\n' '#!/bin/sh' 'echo git version stub' > "$CURRENT/vendor/git/bin/git"
  chmod +x "$CURRENT/vendor/git/bin/git"
fi
if [ "$STEP" = "tectonic" ] || [ "$STEP" = "all" ]; then
  printf '%s\\n' '#!/bin/sh' 'echo tectonic 0.15.0' > "$CURRENT/bin/tectonic"
  chmod +x "$CURRENT/bin/tectonic"
fi
if [ "$STEP" = "tinymist" ] || [ "$STEP" = "all" ]; then
  printf '%s\\n' '#!/bin/sh' 'echo tinymist 0.15.2' > "$CURRENT/bin/tinymist"
  chmod +x "$CURRENT/bin/tinymist"
fi
echo "stub $STEP"
`;

async function makeHostTarball(dir: string): Promise<{ tarballPath: string; sha256: string }> {
  const current = join(dir, "current", "bin");
  mkdirSync(current, { recursive: true });
  writeFileSync(join(current, "prismnext-host"), "#!/usr/bin/env node\nconsole.log('host')\n", {
    mode: 0o755,
  });
  writeFileSync(join(current, "node"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`, {
    mode: 0o755,
  });
  writeStubBin(join(dir, "current", "bin", "tectonic"));
  writeStubBin(join(dir, "current", "bin", "tinymist"));
  writeStubBin(join(dir, "current", "vendor", "git", "bin", "git"));
  const tarballPath = join(dir, "payload.tar.gz");
  await tarCreate({ gzip: true, file: tarballPath, cwd: dir }, ["current"]);
  return { tarballPath, sha256: sha256File(tarballPath) };
}

describe("ensureHostPayload", () => {
  it("pushes a local tarball and leaves ~/.prismnext user data alone", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-boot-stage-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-boot-home-"));
    mkdirSync(join(remoteHome, ".prismnext", "sessions"), { recursive: true });
    writeFileSync(join(remoteHome, ".prismnext", "sessions", "keep-me.json"), "{\"ok\":true}\n");

    const tarball = await makeHostTarball(staging);
    const ssh = createDirectoryBackedSshClient(remoteHome);
    const session = await ssh.connect({
      host: "lab",
      port: 22,
      user: "me",
      onHostKey: () => "accept",
    });
    const logs: string[] = [];
    const first = await ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      log: (m) => logs.push(m),
    });
    expect(first.action).toBe("pushed");
    expect(first.stamp.payloadSha256).toBe(tarball.sha256);
    expect(first.nodeBin).toContain("/bin/node");
    expect(first.hostBin).toContain("/bin/prismnext-host");
    expect(first.currentDir).toContain("/.prismnext-host/current");

    const second = await ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      log: (m) => logs.push(m),
    });
    expect(second.action).toBe("skipped");
    expect(logs.some((line) => /skipping install/i.test(line))).toBe(true);
    expect(logs.filter((line) => /downloading /i.test(line))).toHaveLength(0);
    const kept = await session.sftpRead(join(remoteHome, ".prismnext", "sessions", "keep-me.json"));
    expect(kept).toContain("ok");
  });

  it("runs install-runtime on the server when Node is not in the tarball", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-boot-slim-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-boot-slim-home-"));
    const current = join(staging, "current", "bin");
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, "prismnext-host"), "#!/usr/bin/env node\nconsole.log('host')\n", {
      mode: 0o755,
    });
    writeFileSync(join(current, "install-runtime"), INSTALL_RUNTIME_STUB, { mode: 0o755 });
    const tarballPath = join(staging, "payload.tar.gz");
    await tarCreate({ gzip: true, file: tarballPath, cwd: staging }, ["current"]);
    const tarball = { tarballPath, sha256: sha256File(tarballPath) };
    const ssh = createDirectoryBackedSshClient(remoteHome);
    const session = await ssh.connect({
      host: "lab",
      port: 22,
      user: "me",
      onHostKey: () => "accept",
    });
    const logs: string[] = [];
    const first = await ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      linuxArch: "linux-x64",
      log: (m) => logs.push(m),
    });
    expect(first.action).toBe("pushed");
    expect(await session.sftpStat(first.nodeBin)).not.toBeNull();
    expect(logs.some((line) => /downloading Node|Remote runtime: node|stub node/i.test(line))).toBe(
      true,
    );
  });

  it("provisions only tectonic when stamp matches and node/git are already present", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-boot-tec-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-boot-tec-home-"));
    const current = join(staging, "current", "bin");
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, "prismnext-host"), "#!/usr/bin/env node\nconsole.log('host')\n", {
      mode: 0o755,
    });
    writeFileSync(join(current, "install-runtime"), INSTALL_RUNTIME_STUB, { mode: 0o755 });
    const tarballPath = join(staging, "payload.tar.gz");
    await tarCreate({ gzip: true, file: tarballPath, cwd: staging }, ["current"]);
    const tarball = { tarballPath, sha256: sha256File(tarballPath) };

    const remoteCurrent = join(remoteHome, ".prismnext-host", "current");
    mkdirSync(join(remoteCurrent, "bin"), { recursive: true });
    writeFileSync(join(remoteCurrent, "bin", "prismnext-host"), "#!/usr/bin/env node\n", {
      mode: 0o755,
    });
    writeStubBin(join(remoteCurrent, "bin", "node"));
    writeStubBin(join(remoteCurrent, "bin", "tinymist"));
    writeStubBin(join(remoteCurrent, "vendor", "git", "bin", "git"));
    writeFileSync(join(remoteCurrent, "bin", "install-runtime"), INSTALL_RUNTIME_STUB, {
      mode: 0o755,
    });
    writeFileSync(
      join(remoteCurrent, "stamp.json"),
      `${JSON.stringify({ desktopVersion: "0.9.0", payloadSha256: tarball.sha256 }, null, 2)}\n`,
    );

    const ssh = createDirectoryBackedSshClient(remoteHome);
    const session = await ssh.connect({
      host: "lab",
      port: 22,
      user: "me",
      onHostKey: () => "accept",
    });
    const execs: string[] = [];
    const origExec = session.exec.bind(session);
    session.exec = async (command, extra) => {
      execs.push(command);
      return origExec(command, extra);
    };
    const logs: string[] = [];
    const result = await ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      linuxArch: "linux-x64",
      log: (m) => logs.push(m),
    });
    expect(result.action).toBe("provisioned");
    const stepCmds = execs.filter((command) => command.includes("--step "));
    expect(stepCmds).toHaveLength(1);
    expect(stepCmds[0]).toContain("--step tectonic");
    expect(stepCmds[0]).not.toContain("--step node");
    expect(stepCmds[0]).not.toContain("--step git");
    expect(logs.some((line) => /tectonic/i.test(line))).toBe(true);
    expect(await session.sftpStat(join(remoteCurrent, "bin", "tectonic"))).not.toBeNull();
  });

  it("still provisions tectonic when SSH reports size 0 for a missing file", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-boot-stat0-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-boot-stat0-home-"));
    const current = join(staging, "current", "bin");
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, "prismnext-host"), "#!/usr/bin/env node\n", { mode: 0o755 });
    writeFileSync(join(current, "install-runtime"), INSTALL_RUNTIME_STUB, { mode: 0o755 });
    const tarballPath = join(staging, "payload.tar.gz");
    await tarCreate({ gzip: true, file: tarballPath, cwd: staging }, ["current"]);
    const tarball = { tarballPath, sha256: sha256File(tarballPath) };

    const remoteCurrent = join(remoteHome, ".prismnext-host", "current");
    mkdirSync(join(remoteCurrent, "bin"), { recursive: true });
    writeFileSync(join(remoteCurrent, "bin", "prismnext-host"), "#!/usr/bin/env node\n", {
      mode: 0o755,
    });
    writeStubBin(join(remoteCurrent, "bin", "node"));
    writeStubBin(join(remoteCurrent, "bin", "tinymist"));
    writeStubBin(join(remoteCurrent, "vendor", "git", "bin", "git"));
    writeFileSync(join(remoteCurrent, "bin", "install-runtime"), INSTALL_RUNTIME_STUB, {
      mode: 0o755,
    });
    writeFileSync(
      join(remoteCurrent, "stamp.json"),
      `${JSON.stringify({ desktopVersion: "0.9.0", payloadSha256: tarball.sha256 }, null, 2)}\n`,
    );

    const ssh = createDirectoryBackedSshClient(remoteHome);
    const session = await ssh.connect({
      host: "lab",
      port: 22,
      user: "me",
      onHostKey: () => "accept",
    });
    const origStat = session.sftpStat.bind(session);
    session.sftpStat = async (remotePath) => {
      const real = await origStat(remotePath);
      return real ?? { size: 0 };
    };
    const execs: string[] = [];
    const origExec = session.exec.bind(session);
    session.exec = async (command, extra) => {
      execs.push(command);
      return origExec(command, extra);
    };
    const result = await ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      linuxArch: "linux-x64",
      log: () => undefined,
    });
    expect(result.action).toBe("provisioned");
    expect(execs.some((command) => command.includes("--step tectonic"))).toBe(true);
  });

  it("fails connect provision if tectonic step exits 0 but dest is still missing", async () => {
    const staging = mkdtempSync(join(tmpdir(), "prism-boot-notec-"));
    const remoteHome = mkdtempSync(join(tmpdir(), "prism-boot-notec-home-"));
    const current = join(staging, "current", "bin");
    mkdirSync(current, { recursive: true });
    writeFileSync(join(current, "prismnext-host"), "#!/usr/bin/env node\n", { mode: 0o755 });
    writeFileSync(
      join(current, "install-runtime"),
      `#!/bin/sh
echo "stub skip tectonic"
exit 0
`,
      { mode: 0o755 },
    );
    const tarballPath = join(staging, "payload.tar.gz");
    await tarCreate({ gzip: true, file: tarballPath, cwd: staging }, ["current"]);
    const tarball = { tarballPath, sha256: sha256File(tarballPath) };

    const remoteCurrent = join(remoteHome, ".prismnext-host", "current");
    mkdirSync(join(remoteCurrent, "bin"), { recursive: true });
    writeFileSync(join(remoteCurrent, "bin", "prismnext-host"), "#!/usr/bin/env node\n", {
      mode: 0o755,
    });
    writeStubBin(join(remoteCurrent, "bin", "node"));
    writeStubBin(join(remoteCurrent, "bin", "tinymist"));
    writeStubBin(join(remoteCurrent, "vendor", "git", "bin", "git"));
    writeFileSync(join(remoteCurrent, "bin", "install-runtime"), `#!/bin/sh\nexit 0\n`, {
      mode: 0o755,
    });
    writeFileSync(
      join(remoteCurrent, "stamp.json"),
      `${JSON.stringify({ desktopVersion: "0.9.0", payloadSha256: tarball.sha256 }, null, 2)}\n`,
    );

    const ssh = createDirectoryBackedSshClient(remoteHome);
    const session = await ssh.connect({
      host: "lab",
      port: 22,
      user: "me",
      onHostKey: () => "accept",
    });
    await expect(ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      linuxArch: "linux-x64",
      log: () => undefined,
    })).rejects.toThrow(/tectonic is still missing/);
  });
});
