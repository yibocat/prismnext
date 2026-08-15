/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { translate } = vi.hoisted(() => ({
  translate: (key: string, fallback?: unknown) =>
    typeof fallback === "string" ? fallback : key,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
    i18n: { language: "en" },
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/components/layout/window-controls", () => ({
  WindowControls: () => <div data-testid="window-controls" />,
}));

vi.mock("@/components/brand/prism-ribbon-mark", () => ({
  PrismRibbonMark: () => <div data-testid="prism-ribbon-mark" />,
}));

vi.mock("@/components/modules/project/new-project-dialog", () => ({
  NewProjectDialog: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="new-project-dialog">{children}</div>
  ),
  NewProjectPane: () => (
    <section>
      <p>project.new.form</p>
    </section>
  ),
}));

vi.mock("@/components/modules/chat/chat-home-backdrop", () => ({
  ChatHomeBackdrop: () => <div data-testid="chat-home-backdrop" />,
}));

vi.mock("@/hooks/use-project-open", () => ({
  useProjectOpen: () => vi.fn().mockResolvedValue(true),
}));

vi.mock("@/stores/pro-license-store", () => ({
  useProLicenseStore: (select: (s: any) => unknown) =>
    select({
      license: null,
      hydrated: true,
      hydrate: vi.fn(),
      refresh: vi.fn(),
      activate: vi.fn(),
    }),
}));

import { WelcomePage } from "@/components/modules/project/welcome-page";

describe("WelcomePage", () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      aboutGetVersions: vi.fn().mockResolvedValue({ appVersion: "0.7.0" }),
      chatStatus: vi.fn().mockResolvedValue({ available: true, phase: "ready" }),
      updateStatus: vi.fn().mockResolvedValue({ status: "up-to-date" }),
      updateCheck: vi.fn().mockResolvedValue({ status: "up-to-date" }),
      onUpdateProgress: vi.fn().mockReturnValue(() => {}),
      onUpdateChanged: vi.fn().mockReturnValue(() => {}),
      compileDetectTexlive: vi.fn().mockResolvedValue(undefined),
      fsExists: vi.fn().mockResolvedValue(true),
      gitIsRepo: vi.fn().mockResolvedValue(true),
      gitBranches: vi.fn().mockResolvedValue({ current: "main" }),
      dialogOpenFolder: vi.fn().mockResolvedValue({ canceled: true }),
      getPathForFile: vi.fn().mockReturnValue("/tmp/dropped-project"),
      fsStat: vi.fn().mockResolvedValue({
        isDirectory: true,
        isFile: false,
        mtimeMs: 0,
        size: 0,
      }),
      projectCheck: vi.fn().mockResolvedValue({ missing: [] }),
    };
  });

  it("starts on recent projects and returns from new project via the back control", () => {
    render(<WelcomePage />);
    expect(screen.getByTestId("chat-home-backdrop")).toBeDefined();
    expect(screen.getByText("welcome.brand")).toBeDefined();
    expect(screen.getByText("welcome.recentProjects")).toBeDefined();
    expect(screen.getByText("welcome.newProject")).toBeDefined();

    fireEvent.click(screen.getByText("welcome.newProject"));
    expect(screen.getByText("project.new.title")).toBeDefined();
    expect(screen.getByText("project.new.form")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "common.back" }));
    expect(screen.getByText("welcome.recentProjects")).toBeDefined();
  });

  it("shows inactive Pro status and expands a key field", () => {
    render(<WelcomePage />);
    expect(screen.getByText("welcome.status.pro")).toBeDefined();
    expect(screen.getByText("welcome.status.proInactive")).toBeDefined();
    fireEvent.click(screen.getByText("settings.about.proActivate"));
    expect(screen.getByPlaceholderText("settings.about.proKeyPlaceholder")).toBeDefined();
  });

  it("shows a drop hint on the open-project pane", () => {
    render(<WelcomePage />);
    fireEvent.click(screen.getByText("welcome.openExisting"));
    expect(screen.getByText("welcome.openDropHint")).toBeDefined();
  });

  it("renders skip button when onSkip is provided", () => {
    const onSkip = vi.fn();
    render(<WelcomePage onSkip={onSkip} />);
    const status = screen.getByText("welcome.status.cardTitle");
    const skip = screen.getByText("common.skipForNow");
    expect(skip).toBeDefined();
    expect(
      Boolean(status.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });
});

