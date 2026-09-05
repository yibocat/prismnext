import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ActivityFold } from "../../src/renderer/components/modules/chat/tools/activity-fold";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ToolWidget pulls heavy deps; stub it — we only observe body mounting.
vi.mock("../../src/renderer/components/modules/chat/tools/tool-widget-dispatcher", () => ({
  ToolWidget: ({ toolUse }: { toolUse: ContentBlock }) => (
    <div data-testid="tool-widget">{String((toolUse as { name?: string }).name)}</div>
  ),
}));

vi.mock("../../src/renderer/components/modules/chat/thinking-widget", () => ({
  ThinkingWidget: () => <div data-testid="thinking-widget" />,
}));

const blocks: ContentBlock[] = [
  { type: "tool_use", id: "t1", name: "manuscript-compile", input: {}, status: "completed" } as ContentBlock,
];

describe("ActivityFold body mounting", () => {
  afterEach(() => cleanup());

  it("does not mount the body while collapsed (claim safety)", () => {
    render(
      <ActivityFold
        blocks={blocks}
        blockIndices={[0]}
        toolResultMap={new Map()}
        sessionId="s"
        isStreamingSegment={false}
        turnSettled
      />,
    );
    expect(screen.queryByTestId("tool-widget")).toBeNull();
  });

  it("mounts the body while expanded and unmounts on collapse", () => {
    render(
      <ActivityFold
        blocks={blocks}
        blockIndices={[0]}
        toolResultMap={new Map()}
        sessionId="s"
        isStreamingSegment={false}
        turnSettled
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("tool-widget")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByTestId("tool-widget")).toBeNull();
  });

  it("unmounts the collapsed live burst body too (claim release mid-stream)", () => {
    render(
      <ActivityFold
        blocks={blocks}
        blockIndices={[0]}
        toolResultMap={new Map()}
        sessionId="s"
        isStreamingSegment
        liveProcessOpen={false}
      />,
    );
    // Auto-collapsed burst: hidden content must not hold visual claims —
    // the same figure in the growing reply has to render.
    expect(screen.queryByTestId("tool-widget")).toBeNull();
  });
});
