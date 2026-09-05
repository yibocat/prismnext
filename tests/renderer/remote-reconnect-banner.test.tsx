import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/stores/remote-store", () => ({
  useRemoteStore: (selector: (s: { byProfileId: unknown }) => unknown) =>
    selector({ byProfileId: (globalThis as { __remoteByProfileId?: unknown }).__remoteByProfileId ?? {} }),
}));

vi.mock("@/stores/document-store", () => ({
  useDocumentStore: (selector: (s: { projectRoot: string | null }) => unknown) =>
    selector({ projectRoot: (globalThis as { __docRoot?: string | null }).__docRoot ?? null }),
}));

import { RemoteReconnectBanner } from "../../src/renderer/components/modules/remote/remote-reconnect-banner";

const g = globalThis as { __remoteByProfileId?: unknown; __docRoot?: string | null };

describe("RemoteReconnectBanner", () => {
  afterEach(() => {
    cleanup();
    g.__remoteByProfileId = {};
    g.__docRoot = null;
  });

  it("renders while the focused remote project is reconnecting", () => {
    g.__docRoot = "remote://lab/home/u/proj";
    g.__remoteByProfileId = { lab: { phase: "reconnecting" } };
    render(<RemoteReconnectBanner />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("remote.reconnectBanner")).toBeTruthy();
  });

  it("renders nothing when ready", () => {
    g.__docRoot = "remote://lab/home/u/proj";
    g.__remoteByProfileId = { lab: { phase: "ready" } };
    const { container } = render(<RemoteReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for local projects", () => {
    g.__docRoot = "/Users/me/proj";
    g.__remoteByProfileId = { lab: { phase: "reconnecting" } };
    const { container } = render(<RemoteReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no project is open", () => {
    g.__docRoot = null;
    g.__remoteByProfileId = { lab: { phase: "reconnecting" } };
    const { container } = render(<RemoteReconnectBanner />);
    expect(container.firstChild).toBeNull();
  });
});
