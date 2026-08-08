import type { ProLoadResult, LicenseSnapshot } from "@shared/pro";
import { isLicenseActive, isLicenseExpired } from "@shared/pro";
import { createProHostAPI, type ProHostAPI, type ProModule } from "./host-api";
import { proContributions } from "./contributions";

type ProModuleImport = ProModule & { __PRISM_PRO_ABSENT?: boolean };

async function importProModule(): Promise<ProModuleImport> {
  return import("@prismnext/pro");
}

export async function tryLoadPro(options: {
  getLicense: () => LicenseSnapshot | null;
  onFeaturesDeclared?: (ids: string[]) => void;
  onContributionsChanged?: () => void;
}): Promise<{ result: ProLoadResult; api: ProHostAPI }> {
  // Fresh contribution set each load attempt (re-activate / rehydrate).
  proContributions.clear();

  const api = createProHostAPI({
    getLicense: options.getLicense,
    onFeaturesDeclared: options.onFeaturesDeclared,
    onContributionsChanged: options.onContributionsChanged,
  });

  const license = options.getLicense();
  if (!license || license.plan !== "pro") {
    return { result: { status: "skipped", reason: "no-license" }, api };
  }
  if (isLicenseExpired(license)) {
    return { result: { status: "skipped", reason: "license-expired" }, api };
  }
  if (!isLicenseActive(license)) {
    return { result: { status: "skipped", reason: "no-license" }, api };
  }

  try {
    const mod = await importProModule();
    if (mod.__PRISM_PRO_ABSENT) {
      return { result: { status: "skipped", reason: "pro-module-absent" }, api };
    }
    if (mod.hostApiVersion !== 1) {
      return {
        result: {
          status: "error",
          reason: "register-failed",
          errorMessage: `Pro hostApiVersion mismatch: got ${String(mod.hostApiVersion)}`,
        },
        api,
      };
    }
    await mod.register(api);
    return { result: { status: "loaded" }, api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    proContributions.clear();
    return {
      result: { status: "error", reason: "register-failed", errorMessage: message },
      api,
    };
  }
}
