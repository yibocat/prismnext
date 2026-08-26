/**
 * Push the desktop's bundled Host tarball over SFTP.
 * Does not download Host from the network. Does not touch `~/.prismnext` user data.
 */

import { join } from "node:path";
import {
  HOST_CURRENT_DIRNAME,
  HOST_INSTALL_DIRNAME,
  HOST_STAMP_FILENAME,
  hostCurrentRel,
  hostInstallRel,
  hostStampRel,
} from "../../shared/workbench/paths";
import { RemoteOperationError, type HostStamp } from "../../shared/remote";
import type { SshSession } from "./ssh-client";

export interface BootstrapInput {
  session: SshSession;
  local: { tarballPath: string; sha256: string; desktopVersion: string };
  log: (message: string) => void;
}

export interface BootstrapResult {
  action: "skipped" | "pushed";
  stamp: HostStamp;
  hostRoot: string;
  appHome: string;
  currentDir: string;
  hostBin: string;
  nodeBin: string;
}

async function remoteHome(session: SshSession): Promise<string> {
  const result = await session.exec('printf %s "$HOME"');
  const home = result.stdout.trim();
  if (!home || result.code !== 0) {
    throw new RemoteOperationError("host_runtime", "could not resolve remote $HOME");
  }
  return home.replace(/\/+$/, "");
}

function parseStamp(raw: string | null): HostStamp | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HostStamp>;
    if (typeof parsed.desktopVersion !== "string" || typeof parsed.payloadSha256 !== "string") {
      return null;
    }
    if (!parsed.desktopVersion || !parsed.payloadSha256) return null;
    return { desktopVersion: parsed.desktopVersion, payloadSha256: parsed.payloadSha256 };
  } catch {
    return null;
  }
}

export async function ensureHostPayload(input: BootstrapInput): Promise<BootstrapResult> {
  const home = await remoteHome(input.session);
  const hostRoot = join(home, hostInstallRel());
  const appHome = join(home, ".prismnext");
  const stampPath = join(home, hostStampRel());
  const incoming = join(hostRoot, "incoming.tar.gz");
  const currentDir = join(home, hostCurrentRel());
  const hostBin = join(currentDir, "bin", "prismnext-host");
  const nodeBin = join(currentDir, "bin", "node");
  const wanted: HostStamp = {
    desktopVersion: input.local.desktopVersion,
    payloadSha256: input.local.sha256,
  };

  const existing = parseStamp(await input.session.sftpRead(stampPath));
  if (existing && existing.payloadSha256 === wanted.payloadSha256) {
    input.log("Host payload already matches this app — skipping transfer.");
    const host = await input.session.sftpStat(hostBin);
    const node = await input.session.sftpStat(nodeBin);
    if (host && node) {
      return { action: "skipped", stamp: existing, hostRoot, appHome, currentDir, hostBin, nodeBin };
    }
    input.log("stamp matched but Host or Node binary missing — pushing again.");
  } else if (existing) {
    input.log("Remote stamp does not match this app — pushing the copy from this computer.");
  } else {
    input.log("No Host install on this machine — pushing the runtime from this computer.");
  }

  const mkdir = await input.session.exec(`mkdir -p "${hostRoot}"`);
  if (mkdir.code !== 0) {
    throw new RemoteOperationError("host_runtime", mkdir.stderr || "could not create Host install directory");
  }

  input.log("Uploading Host payload…");
  await input.session.sftpPut(input.local.tarballPath, incoming);

  const extract = await input.session.exec(
    `tar -xzf "${incoming}" -C "${hostRoot}" && chmod +x "${hostBin}" "${nodeBin}" 2>/dev/null || true`,
  );
  if (extract.code !== 0) {
    throw new RemoteOperationError(
      "bootstrap_checksum",
      extract.stderr || "failed to extract Host payload",
    );
  }

  const host = await input.session.sftpStat(hostBin);
  const node = await input.session.sftpStat(nodeBin);
  if (!host || !node) {
    throw new RemoteOperationError(
      "bootstrap_checksum",
      "extracted payload is missing current/bin/prismnext-host or current/bin/node",
    );
  }

  await input.session.sftpWrite(stampPath, `${JSON.stringify(wanted, null, 2)}\n`);
  const written = parseStamp(await input.session.sftpRead(stampPath));
  if (!written || written.payloadSha256 !== wanted.payloadSha256) {
    throw new RemoteOperationError("bootstrap_checksum", "failed to write Host stamp");
  }

  input.log(`Host ready (${wanted.desktopVersion}, ${wanted.payloadSha256.slice(0, 8)}).`);
  return { action: "pushed", stamp: wanted, hostRoot, appHome, currentDir, hostBin, nodeBin };
}

export { HOST_CURRENT_DIRNAME, HOST_INSTALL_DIRNAME, HOST_STAMP_FILENAME };
