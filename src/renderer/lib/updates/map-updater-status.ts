import type { UpdaterStatus } from "@/types/electron";

/** UI-facing updater state shared by About and welcome. */
export type UpdateUiStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date"; currentVersion: string }
  | {
      kind: "available";
      currentVersion: string;
      latestVersion: string;
      releaseNotes?: string;
      downloadPath?: string;
    }
  | {
      kind: "ignored";
      currentVersion: string;
      latestVersion: string;
      downloadPath?: string;
    }
  | {
      kind: "downloading";
      currentVersion: string;
      latestVersion?: string;
      percent: number;
      downloadPath?: string;
    }
  | {
      kind: "downloaded";
      currentVersion: string;
      latestVersion?: string;
      downloadPath?: string;
    }
  | { kind: "error"; message: string; downloadPath?: string }
  | { kind: "no-source" };

export function mapUpdaterStatus(result: UpdaterStatus | null | undefined): UpdateUiStatus {
  if (!result || result.status === "idle") return { kind: "idle" };
  switch (result.status) {
    case "checking":
      return { kind: "checking" };
    case "up-to-date":
      return { kind: "up-to-date", currentVersion: result.currentVersion };
    case "available":
      return {
        kind: "available",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion ?? result.latest?.version ?? "",
        releaseNotes: result.releaseNotes ?? result.latest?.releaseNotes,
        downloadPath: result.latest?.path,
      };
    case "ignored":
      return {
        kind: "ignored",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion ?? result.latest?.version ?? "",
        downloadPath: result.latest?.path,
      };
    case "downloading":
      return {
        kind: "downloading",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        percent: result.progress?.percent ?? 0,
        downloadPath: result.latest?.path,
      };
    case "downloaded":
      return {
        kind: "downloaded",
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        downloadPath: result.latest?.path,
      };
    case "error":
      return {
        kind: "error",
        message: result.error ?? "Unknown error",
        downloadPath: result.latest?.path,
      };
    case "no-source":
      return { kind: "no-source" };
    default:
      return { kind: "idle" };
  }
}
