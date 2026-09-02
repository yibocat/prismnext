/**
 * Push the desktop's slim Host tarball over SFTP, then let the server
 * download Node / Git / Tectonic / Tinymist / AnyDoc from the packed pin files.
 * Does not touch `~/.prismnext` user data.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOST_CURRENT_DIRNAME,
  HOST_INSTALL_DIRNAME,
  HOST_RUNTIME_STAMP_FILENAME,
  HOST_STAMP_FILENAME,
  hostCurrentRel,
  hostInstallRel,
  hostStampRel,
} from "../../shared/workbench/paths";
import {
  RemoteOperationError,
  hostRuntimePinsFromFiles,
  inventoryMissingSteps,
  runtimeBinFromStat,
  mergeHostRuntimePins,
  parseHostPinMap,
  hostPayloadAnydocNativePath,
  hostPayloadAnydocNativeCandidates,
  HOST_RUNTIME_STEPS,
  type HostRuntimeInventory,
  type HostRuntimePins,
  type HostRuntimeStep,
  type HostStamp,
} from "../../shared/remote";
import type { SshExecResult, SshSession } from "./ssh-client";

/** One runtime download step (Node tarball is ~30–60 MB). */
export const HOST_RUNTIME_STEP_TIMEOUT_MS = 15 * 60 * 1000;

export interface BootstrapInput {
  session: SshSession;
  local: { tarballPath: string; sha256: string; desktopVersion: string };
  log: (message: string) => void;
  /** linux-x64 → x64. The installer uses this; uname is the fallback. */
  linuxArch?: "linux-x64" | "linux-arm64";
  /** Desktop pin versions. Defaults to `scripts/host` + remote `current/runtime`. */
  pins?: HostRuntimePins;
}

export interface BootstrapResult {
  action: "skipped" | "pushed" | "provisioned";
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

function installerArch(linuxArch?: "linux-x64" | "linux-arm64"): "x64" | "arm64" | null {
  if (linuxArch === "linux-x64") return "x64";
  if (linuxArch === "linux-arm64") return "arm64";
  return null;
}

function logExecOutput(log: (message: string) => void, result: SshExecResult): void {
  const text = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of text.slice(-12)) {
    log(line);
  }
}

function readDesktopHostRuntimePins(): HostRuntimePins {
  const dir = join(process.cwd(), "scripts", "host");
  try {
    return hostRuntimePinsFromFiles({
      node: readFileSync(join(dir, "node-version.txt"), "utf8"),
      git: readFileSync(join(dir, "git-version.txt"), "utf8"),
      tectonic: readFileSync(join(dir, "tectonic-linux.txt"), "utf8"),
      tinymist: readFileSync(join(dir, "tinymist-linux.txt"), "utf8"),
      anydoc: readFileSync(join(dir, "anydoc-linux.txt"), "utf8"),
    });
  } catch {
    return { node: "", git: "", tectonic: "", tinymist: "", anydoc: "" };
  }
}

async function readRemotePayloadPins(session: SshSession, currentDir: string): Promise<HostRuntimePins> {
  const runtime = join(currentDir, "runtime");
  return hostRuntimePinsFromFiles({
    node: await session.sftpRead(join(runtime, "node-version.txt")),
    git: await session.sftpRead(join(runtime, "git-version.txt")),
    tectonic: await session.sftpRead(join(runtime, "tectonic-linux.txt")),
    tinymist: await session.sftpRead(join(runtime, "tinymist-linux.txt")),
    anydoc: await session.sftpRead(join(runtime, "anydoc-linux.txt")),
  });
}

async function collectRuntimeInventory(
  session: SshSession,
  currentDir: string,
  hostRoot: string,
  linuxArch?: "linux-x64" | "linux-arm64",
): Promise<HostRuntimeInventory> {
  const nodeBin = join(currentDir, "bin", "node");
  const tectonicBin = join(currentDir, "bin", "tectonic");
  const tinymistBin = join(currentDir, "bin", "tinymist");
  const gitBin = join(currentDir, "vendor", "git", "bin", "git");
  const arch = installerArch(linuxArch);
  const anydocCandidates = hostPayloadAnydocNativeCandidates(currentDir, arch);
  const stamp = parseHostPinMap(await session.sftpRead(join(hostRoot, HOST_RUNTIME_STAMP_FILENAME)));
  const [node, git, tectonic, tinymist, ...anydocStats] = await Promise.all([
    session.sftpStat(nodeBin),
    session.sftpStat(gitBin),
    session.sftpStat(tectonicBin),
    session.sftpStat(tinymistBin),
    ...anydocCandidates.map((path) => session.sftpStat(path)),
  ]);
  let anydocPath = "";
  let anydocStat: { size: number } | null = null;
  for (let i = 0; i < anydocCandidates.length; i += 1) {
    const candidate = anydocStats[i] ?? null;
    if (candidate && candidate.size > 0) {
      anydocPath = anydocCandidates[i]!;
      anydocStat = candidate;
      break;
    }
  }
  return {
    node: runtimeBinFromStat(node, nodeBin, stamp.node ?? null),
    git: runtimeBinFromStat(git, gitBin, stamp.git ?? null),
    tectonic: runtimeBinFromStat(tectonic, tectonicBin, stamp.tectonic ?? null),
    tinymist: runtimeBinFromStat(tinymist, tinymistBin, stamp.tinymist ?? null),
    anydoc: runtimeBinFromStat(anydocStat, anydocPath, stamp.anydoc ?? null),
  };
}

async function missingRuntimeSteps(input: {
  session: SshSession;
  currentDir: string;
  hostRoot: string;
  linuxArch?: "linux-x64" | "linux-arm64";
  pins?: HostRuntimePins;
}): Promise<HostRuntimeStep[]> {
  const inventory = await collectRuntimeInventory(
    input.session,
    input.currentDir,
    input.hostRoot,
    input.linuxArch,
  );
  const pins = mergeHostRuntimePins(
    input.pins ?? { node: "", git: "", tectonic: "", tinymist: "", anydoc: "" },
    await readRemotePayloadPins(input.session, input.currentDir),
    readDesktopHostRuntimePins(),
  );
  return inventoryMissingSteps(inventory, pins);
}

async function provisionHostRuntime(input: {
  session: SshSession;
  currentDir: string;
  hostBin: string;
  nodeBin: string;
  linuxArch?: "linux-x64" | "linux-arm64";
  log: (message: string) => void;
  steps?: HostRuntimeStep[];
}): Promise<void> {
  const steps = input.steps ?? [...HOST_RUNTIME_STEPS];
  if (steps.length === 0) return;

  const installBin = join(input.currentDir, "bin", "install-runtime");
  const installer = await input.session.sftpStat(installBin);
  const node = await input.session.sftpStat(input.nodeBin);
  if (!installer) {
    if (node) return;
    throw new RemoteOperationError(
      "host_runtime",
      "Host payload is missing bin/install-runtime and the server has no Node yet.",
    );
  }

  const arch = installerArch(input.linuxArch);
  const archFlag = arch ? ` --arch ${arch}` : "";
  if (steps.length === HOST_RUNTIME_STEPS.length) {
    input.log("Server is downloading Node, Git, Tectonic, Tinymist, and AnyDoc (needs outbound HTTPS)…");
  } else {
    input.log(`Server is downloading ${steps.join(", ")} (needs outbound HTTPS)…`);
  }
  for (const step of steps) {
    input.log(`Remote runtime: ${step}…`);
    const result = await input.session.exec(
      `sh "${installBin}" --current "${input.currentDir}" --step ${step}${archFlag}`,
      { timeoutMs: HOST_RUNTIME_STEP_TIMEOUT_MS },
    );
    logExecOutput(input.log, result);
    if (result.code !== 0) {
      throw new RemoteOperationError(
        "host_runtime",
        result.stderr.trim()
          || result.stdout.trim()
            || `server failed to download Host ${step}. The machine must reach nodejs.org, GitHub, and registry.npmjs.org.`,
      );
    }
  }

  const host = await input.session.sftpStat(input.hostBin);
  const ready = await input.session.sftpStat(input.nodeBin);
  if (!host || !ready) {
    throw new RemoteOperationError(
      "host_runtime",
      "server finished install-runtime but current/bin/prismnext-host or current/bin/node is still missing",
    );
  }
  if (steps.includes("tectonic")) {
    const tectonicBin = join(input.currentDir, "bin", "tectonic");
    const tectonic = await input.session.sftpStat(tectonicBin);
    if (!tectonic || tectonic.size <= 0) {
      throw new RemoteOperationError(
        "host_runtime",
        "install-runtime finished but ~/.prismnext-host/current/bin/tectonic is still missing",
      );
    }
  }
  if (steps.includes("tinymist")) {
    const tinymistBin = join(input.currentDir, "bin", "tinymist");
    const tinymist = await input.session.sftpStat(tinymistBin);
    if (!tinymist || tinymist.size <= 0) {
      throw new RemoteOperationError(
        "host_runtime",
        "install-runtime finished but ~/.prismnext-host/current/bin/tinymist is still missing",
      );
    }
  }
  if (steps.includes("anydoc")) {
    const arch = installerArch(input.linuxArch);
    if (arch) {
      const native = hostPayloadAnydocNativePath(input.currentDir, arch);
      const anydoc = await input.session.sftpStat(native);
      if (!anydoc || anydoc.size <= 0) {
        throw new RemoteOperationError(
          "host_runtime",
          "install-runtime finished but Host AnyDoc native binding is still missing",
        );
      }
    }
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
  const host = await input.session.sftpStat(hostBin);

  if (existing && existing.payloadSha256 === wanted.payloadSha256 && host) {
    const missing = await missingRuntimeSteps({
      session: input.session,
      currentDir,
      hostRoot,
      linuxArch: input.linuxArch,
      pins: input.pins,
    });
    if (missing.length === 0) {
      input.log("Host program and Node / Git / Tectonic / Tinymist / AnyDoc already match this app — skipping install.");
      return { action: "skipped", stamp: existing, hostRoot, appHome, currentDir, hostBin, nodeBin };
    }
    input.log(`Host program is present; installing missing runtime: ${missing.join(", ")}.`);
    await provisionHostRuntime({
      session: input.session,
      currentDir,
      hostBin,
      nodeBin,
      linuxArch: input.linuxArch,
      log: input.log,
      steps: missing,
    });
    return { action: "provisioned", stamp: existing, hostRoot, appHome, currentDir, hostBin, nodeBin };
  }

  if (existing) {
    input.log("Remote stamp does not match this app — pushing the Host program from this computer.");
  } else {
    input.log("No Host install on this machine — pushing the Host program from this computer.");
  }

  const mkdir = await input.session.exec(`mkdir -p "${hostRoot}"`);
  if (mkdir.code !== 0) {
    throw new RemoteOperationError("host_runtime", mkdir.stderr || "could not create Host install directory");
  }

  input.log("Uploading Host program…");
  await input.session.sftpPut(input.local.tarballPath, incoming);

  const extract = await input.session.exec(`tar -xzf "${incoming}" -C "${hostRoot}"`);
  if (extract.code !== 0) {
    throw new RemoteOperationError(
      "bootstrap_checksum",
      extract.stderr || "failed to extract Host payload",
    );
  }
  await input.session.exec(
    `chmod +x "${hostBin}" "${currentDir}/bin/install-runtime" 2>/dev/null || true`,
  );

  const hostAfter = await input.session.sftpStat(hostBin);
  if (!hostAfter) {
    throw new RemoteOperationError(
      "bootstrap_checksum",
      "extracted payload is missing current/bin/prismnext-host",
    );
  }

  await input.session.sftpWrite(stampPath, `${JSON.stringify(wanted, null, 2)}\n`);
  const written = parseStamp(await input.session.sftpRead(stampPath));
  if (!written || written.payloadSha256 !== wanted.payloadSha256) {
    throw new RemoteOperationError("bootstrap_checksum", "failed to write Host stamp");
  }

  const missing = await missingRuntimeSteps({
    session: input.session,
    currentDir,
    hostRoot,
    linuxArch: input.linuxArch,
    pins: input.pins,
  });
  await provisionHostRuntime({
    session: input.session,
    currentDir,
    hostBin,
    nodeBin,
    linuxArch: input.linuxArch,
    log: input.log,
    steps: missing,
  });

  input.log(`Host ready (${wanted.desktopVersion}, ${wanted.payloadSha256.slice(0, 8)}).`);
  return { action: "pushed", stamp: wanted, hostRoot, appHome, currentDir, hostBin, nodeBin };
}

export { HOST_CURRENT_DIRNAME, HOST_INSTALL_DIRNAME, HOST_STAMP_FILENAME };
