import { create } from "zustand";
import { toast } from "sonner";
import type {
  ActivateLicenseResult,
  LicenseSnapshot,
  ProLoadResult,
  ProLoadStatus,
} from "@shared/pro";
import { licenseGrantsFeature } from "@shared/pro";
import { i18n } from "@/lib/i18n";
import { tryLoadPro } from "@/lib/pro/load-pro";
import { proContributions } from "@/lib/pro/contributions";
import type { ProContributionsSnapshot } from "@/lib/pro/contribution-types";
import { proDesktop } from "@/lib/desktop-api/pro";

interface ProLicenseState {
  license: LicenseSnapshot | null;
  loadStatus: ProLoadStatus;
  loadResult: ProLoadResult | null;
  declaredFeatures: string[];
  contributions: ProContributionsSnapshot;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Re-read the license from main (welcome / About). Skips if a fetch is already in flight. */
  refresh: () => Promise<void>;
  activate: (rawKey: string) => Promise<ActivateLicenseResult>;
  clear: () => Promise<void>;
  reloadProModule: () => Promise<void>;
  hasFeature: (id: string) => boolean;
}

const emptyContributions = (): ProContributionsSnapshot => ({
  settings: [],
  declaredFeatures: [],
});

/** Coalesce concurrent activate+hydrate into one load. */
let reloadProModuleInFlight: Promise<void> | null = null;
/** Coalesce React StrictMode double-mount of App hydrate effect. */
let hydrateInFlight: Promise<void> | null = null;

function sameLicense(a: LicenseSnapshot | null, b: LicenseSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.key === b.key && a.plan === b.plan && a.expiresAt === b.expiresAt;
}

/**
 * Main invalidates its Team resolver when the license changes. Mirror that
 * change in the renderer so an already-open picker never retains stale
 * `locked` / `enabled` views or an unusable tab-level Team selection.
 */
async function synchronizeTeamsAfterLicenseChange(): Promise<void> {
  try {
    const { useDocumentStore } = await import("./document-store");
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (!projectRoot) return;

    const { useTeamsStore } = await import("./teams-store");
    await useTeamsStore.getState().load(projectRoot, { force: true });

    const usableTeamIds = new Set(
      useTeamsStore
        .getState()
        .catalog
        .filter((team) => team.enabled && team.hasOrchestrator && !team.locked)
        .map((team) => team.manifest.id),
    );

    const { useChatStore } = await import("./chat-store");
    const chat = useChatStore.getState();
    for (const tab of chat.tabs) {
      if (tab.sessionTeamId && !usableTeamIds.has(tab.sessionTeamId)) {
        chat.setSessionTeamId(tab.id, null);
      }
    }
  } catch {
    // License activation/clear is already authoritative in main. A transient
    // renderer catalog reload failure is retried on the next Team view load.
  }
}

export const useProLicenseStore = create<ProLicenseState>((set, get) => ({
  license: null,
  loadStatus: "idle",
  loadResult: null,
  declaredFeatures: [],
  contributions: emptyContributions(),
  hydrated: false,

  hydrate: async () => {
    // StrictMode remount: first effect already finished → do not register twice.
    if (get().hydrated) return;
    return get().refresh();
  },

  refresh: async () => {
    if (hydrateInFlight) return hydrateInFlight;

    hydrateInFlight = (async () => {
      try {
        const prev = get().license;
        const license = (await proDesktop.proGetLicense()) ?? null;
        set({ license, hydrated: true });
        if (!sameLicense(prev, license) || get().loadStatus === "idle") {
          await get().reloadProModule();
          await synchronizeTeamsAfterLicenseChange();
        }
      } catch {
        set({
          license: null,
          hydrated: true,
          loadStatus: "skipped",
          contributions: emptyContributions(),
        });
      } finally {
        hydrateInFlight = null;
      }
    })();
    return hydrateInFlight;
  },

  activate: async (rawKey) => {
    const result = await proDesktop.proActivate(rawKey);
    if (result.ok) {
      set({ license: result.license });
      await get().reloadProModule();
      await synchronizeTeamsAfterLicenseChange();
      toast.success(i18n.t("settings.about.proActivateSuccess"));
    }
    return result;
  },

  clear: async () => {
    await proDesktop.proClearLicense();
    proContributions.clear();
    set({
      license: null,
      loadStatus: "skipped",
      loadResult: { status: "skipped", reason: "no-license" },
      declaredFeatures: [],
      contributions: emptyContributions(),
    });
    await synchronizeTeamsAfterLicenseChange();
  },

  reloadProModule: async () => {
    if (reloadProModuleInFlight) return reloadProModuleInFlight;

    reloadProModuleInFlight = (async () => {
      set({ loadStatus: "loading" });
      try {
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
      } finally {
        reloadProModuleInFlight = null;
      }
    })();
    return reloadProModuleInFlight;
  },

  hasFeature: (id) => licenseGrantsFeature(get().license, id),
}));
