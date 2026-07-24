/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TurnRail, type TurnRailPreview } from "@/components/modules/chat/turn-rail";

const previews: TurnRailPreview[] = [
  { text: "first turn", hasAttachments: false },
  { text: "second turn", hasAttachments: false, meta: { completedAt: 1000, modelLabel: "claude" } },
  { text: "", hasAttachments: true },
];

const nullRef: { current: HTMLDivElement | null } = { current: null };

describe("TurnRail", () => {
  it("renders nothing when fewer than 2 turns", () => {
    const { container } = render(
      <TurnRail previews={[previews[0]!]} windowStart={0} scrollContainerRef={nullRef} onJump={() => {}} />,
    );
    expect(container.querySelector("[data-chat-turn-rail]")).toBeNull();
  });

  it("renders one bar per preview", () => {
    const { container } = render(
      <TurnRail previews={previews} windowStart={0} scrollContainerRef={nullRef} onJump={() => {}} />,
    );
    const bars = container.querySelectorAll("[data-chat-turn-bar]");
    expect(bars).toHaveLength(3);
  });

  it("calls onJump with the turn index on click", () => {
    const onJump = vi.fn();
    const { container } = render(
      <TurnRail previews={previews} windowStart={0} scrollContainerRef={nullRef} onJump={onJump} />,
    );
    const buttons = container.querySelectorAll("button[aria-label^='Turn']");
    fireEvent.click(buttons[1]!);
    expect(onJump).toHaveBeenCalledWith(1);
  });

  it("dims bars before the virtual window start", () => {
    const { container } = render(
      <TurnRail previews={previews} windowStart={1} scrollContainerRef={nullRef} onJump={() => {}} />,
    );
    const bars = container.querySelectorAll("[data-chat-turn-bar]");
    expect(bars[0]?.className).toContain("opacity-40");
    expect(bars[1]?.className).not.toContain("opacity-40");
  });
});
