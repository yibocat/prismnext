import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { FocusEvent } from "react";
import { preferFieldOnOpenAutoFocus } from "@/components/ui/dialog";
import { suppressTooltipFocusOpen, TOOLTIP_DELAY_MS } from "@/components/ui/tooltip";

const REPO = join(import.meta.dirname, "../..");

function sourceOf(rel: string): string {
  return readFileSync(join(REPO, rel), "utf-8");
}

function focusEvent(focusVisible: boolean): FocusEvent {
  return {
    preventDefault: vi.fn(),
    currentTarget: {
      matches: (sel: string) => sel === ":focus-visible" && focusVisible,
    },
  } as unknown as FocusEvent;
}

describe("tooltip delay and focus", () => {
  it("waits 700ms and lives under one app provider", () => {
    expect(TOOLTIP_DELAY_MS).toBe(700);
    expect(sourceOf("src/renderer/main.tsx")).toContain("TooltipProvider");
    expect(sourceOf("src/renderer/components/ui/sidebar.tsx")).not.toContain(
      "delayDuration={0}",
    );
    expect(sourceOf("src/renderer/components/ui/tooltip.tsx")).toContain(
      "return <TooltipPrimitive.Root data-slot=\"tooltip\" {...props} />;",
    );
  });

  it("does not open on programmatic or click focus", () => {
    const event = focusEvent(false);
    suppressTooltipFocusOpen(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("still opens when the user tabs to the control", () => {
    const event = focusEvent(true);
    suppressTooltipFocusOpen(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("focuses a text field when a dialog opens, not the first button", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");
    const input = document.createElement("input");
    root.append(button, input);
    document.body.append(root);
    const event = {
      preventDefault: vi.fn(),
      currentTarget: root,
    } as unknown as Event;
    preferFieldOnOpenAutoFocus(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    root.remove();
  });

  it("does not merge Hint onto another Radix asChild trigger", () => {
    const hint = sourceOf("src/renderer/components/ui/hint.tsx");
    expect(hint).toContain(
      'cn("inline-flex max-w-full items-center justify-center", triggerClassName)',
    );
    expect(hint).not.toContain("<TooltipTrigger asChild>{children}</TooltipTrigger>");
  });

  it("does not restore focus when a context menu closes", () => {
    expect(sourceOf("src/renderer/components/ui/context-menu.tsx")).toContain(
      "onCloseAutoFocus = (event) => event.preventDefault()",
    );
  });

  it("does not focus an icon-only surface", () => {
    const root = document.createElement("div");
    const button = document.createElement("button");
    const focus = vi.spyOn(button, "focus");
    root.append(button);
    preferFieldOnOpenAutoFocus({
      preventDefault: vi.fn(),
      currentTarget: root,
    } as unknown as Event);
    expect(focus).not.toHaveBeenCalled();
  });
});
