import { create } from "zustand";
import type {
  ActivateLicenseResult,
  LicenseSnapshot,
  ProLoadResult,
  ProLoadStatus,
} from "@shared/pro";
import { licenseGrantsFeature } from "@shared/pro";
import { tryLoadPro } from "@/lib/pro/load-pro";
import { proContributions } from "@/lib/pro/contributions";
import type { ProContributionsSnapshot } from "@/lib/pro/contribution-types";

interface ProLicenseState {
  license: LicenseSnapshot | null;
  loadStatus: ProLoadStatus;
  loadResult: ProLoadResult | null;
  declaredFeatures: string[];
  contributions: ProContributionsSnapshot;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  activate: (rawKey: string) => Promise<ActivateLicenseResult>;
  clear: () => Promise<void>;
  reloadProModule: () => Promise<void>;
  hasFeature: (id: string) => boolean;
}

const emptyContributions = (): ProContributionsSnapshot => ({
  settings: [],
  declaredFeatures: [],
});

export const useProLicenseStore = create<ProLicenseState>((set, get) => ({
  license: null,
  loadStatus: "idle",
  loadResult: null,
  declaredFeatures: [],
  contributions: emptyContributions(),
  hydrated: false,

  hydrate: async () => {
    try {
      const license = (await window.electronAPI.proGetLicense()) ?? null;
      set({ license, hydrated: true });
      await get().reloadProModule();
    } catch {
      set({
        license: null,
        hydrated: true,
        loadStatus: "skipped",
        contributions: emptyContributions(),
      });
    }
  },

  activate: async (rawKey) => {
    const result = await window.electronAPI.proActivate(rawKey);
    if (result.ok) {
      set({ license: result.license });
      await get().reloadProModule();
    }
    return result;
  },

  clear: async () => {
    await window.electronAPI.proClearLicense();
    proContributions.clear();
    set({
      license: null,
      loadStatus: "skipped",
      loadResult: { status: "skipped", reason: "no-license" },
      declaredFeatures: [],
      contributions: emptyContributions(),
    });
  },

  reloadProModule: async () => {
    set({ loadStatus: "loading" });
    const { result } = await tryLoadPro({
      getLicense: () => get().license,
      onFeaturesDeclared: (ids) => set({ declaredFeatures: ids }),
      onContributionsChanged: () => {
        set({ contributions: proContributions.snapshot() });
      },
    });
    set({
      loadStatus: result.status,
      loadResult: result,
      contributions: proContributions.snapshot(),
      declaredFeatures: proContributions.getDeclaredFeatures(),
    });
  },

  hasFeature: (id) => licenseGrantsFeature(get().license, id),
}));
