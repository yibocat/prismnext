import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activateLicense: vi.fn(),
  clearLicense: vi.fn(),
  loadTeams: vi.fn(),
  setSessionTeamId: vi.fn(),
  reloadPro: vi.fn(),
}));

vi.mock("@/lib/pro/load-pro", () => ({
  tryLoadPro: mocks.reloadPro,
}));

vi.mock("@/lib/pro/contributions", () => ({
  proContributions: {
    clear: vi.fn(),
    snapshot: () => ({ settings: [], declaredFeatures: [] }),
    getDeclaredFeatures: () => [],
  },
}));

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: {
    getState: () => ({ projectRoot: "/tmp/prism-license-project" }),
  },
}));

vi.mock("@/stores/teams-store", () => ({
  useTeamsStore: {
    getState: () => ({
      load: mocks.loadTeams,
      catalog: [
        {
          manifest: { id: "prismnext.pro.test" },
          enabled: false,
          hasOrchestrator: true,
          locked: true,
        },
      ],
    }),
  },
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: {
    getState: () => ({
      tabs: [{ id: "tab-pro", sessionTeamId: "prismnext.pro.test" }],
      setSessionTeamId: mocks.setSessionTeamId,
    }),
  },
}));

import { useProLicenseStore } from "@/stores/pro-license-store";

describe("Pro license Team synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activateLicense.mockResolvedValue({
      ok: true,
      license: {
        key: "PRISM-PRO-DEV-TEST",
        plan: "pro",
        activatedAt: "2026-08-15T00:00:00.000Z",
        expiresAt: null,
        features: [],
      },
    });
    mocks.clearLicense.mockResolvedValue({ ok: true });
    mocks.loadTeams.mockResolvedValue(undefined);
    mocks.reloadPro.mockResolvedValue({ result: { status: "skipped" } });
    (window as typeof window & { electronAPI: unknown }).electronAPI = {
      proActivate: mocks.activateLicense,
      proClearLicense: mocks.clearLicense,
    } as unknown as typeof window.electronAPI;
    useProLicenseStore.setState({
      license: {
        key: "PRISM-PRO-DEV-TEST",
        plan: "pro",
        activatedAt: "2026-08-15T00:00:00.000Z",
        expiresAt: null,
        features: [],
      },
      loadStatus: "loaded",
    });
  });

  it("reloads the current Team catalog and drops invalid Pro tab overrides after clearing", async () => {
    await useProLicenseStore.getState().clear();

    expect(mocks.loadTeams).toHaveBeenCalledWith("/tmp/prism-license-project", { force: true });
    expect(mocks.setSessionTeamId).toHaveBeenCalledWith("tab-pro", null);
  });

  it("reloads the current Team catalog after activation", async () => {
    useProLicenseStore.setState({ license: null, loadStatus: "skipped" });

    await useProLicenseStore.getState().activate("PRISM-PRO-DEV-TEST");

    expect(mocks.loadTeams).toHaveBeenCalledWith("/tmp/prism-license-project", { force: true });
  });
});
