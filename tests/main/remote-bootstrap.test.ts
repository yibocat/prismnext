import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create as tarCreate } from "tar";
import { describe, expect, it } from "vitest";
import { ensureHostPayload } from "../../src/main/remote/bootstrap";
import { createDirectoryBackedSshClient } from "../../src/main/remote/ssh-client";
import { sha256File } from "../../src/main/remote/payload-path";

async function makeHostTarball(dir: string): Promise<{ tarballPath: string; sha256: string }> {
  const current = join(dir, "current", "bin");
  mkdirSync(current, { recursive: true });
  writeFileSync(join(current, "prismnext-host"), "#!/usr/bin/env node\nconsole.log('host')\n", {
    mode: 0o755,
  });
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

    const second = await ensureHostPayload({
      session,
      local: { ...tarball, desktopVersion: "0.9.0" },
      log: (m) => logs.push(m),
    });
    expect(second.action).toBe("skipped");
    const kept = await session.sftpRead(join(remoteHome, ".prismnext", "sessions", "keep-me.json"));
    expect(kept).toContain("ok");
  });
});
