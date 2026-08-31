import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  HOST_INSTALL_DIRNAME,
  HOST_STAMP_FILENAME,
  WORKBENCH_HOME_DIRNAME,
  hostStampRel,
} from "../shared/workbench/paths";
import { REMOTE_PROTOCOL_REV, type HostHandshake, type HostStamp } from "../shared/remote";

function hereDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname === "string" ? __dirname : process.cwd();
  }
}

export function readHostStamp(explicit?: string): HostStamp {
  const candidates = [
    explicit,
    process.env.PRISMNEXT_HOST_STAMP,
    join(hereDir(), "..", HOST_STAMP_FILENAME),
    join(homedir(), hostStampRel()),
  ].filter((item): item is string => Boolean(item));

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<HostStamp>;
      if (typeof parsed.desktopVersion === "string" && typeof parsed.payloadSha256 === "string") {
        return { desktopVersion: parsed.desktopVersion, payloadSha256: parsed.payloadSha256 };
      }
    } catch {
      // try next
    }
  }
  return { desktopVersion: "dev", payloadSha256: "unpacked" };
}

export function buildHandshake(stamp: HostStamp): HostHandshake {
  const home = process.env.HOME?.replace(/\/+$/, "") || homedir();
  return {
    protocolRev: REMOTE_PROTOCOL_REV,
    desktopVersion: stamp.desktopVersion,
    payloadSha256: stamp.payloadSha256,
    appHome: join(home, WORKBENCH_HOME_DIRNAME),
    hostRoot: join(home, HOST_INSTALL_DIRNAME),
    features: ["control"],
  };
}
