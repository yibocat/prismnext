/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import { TooltipProvider } from "@/components/ui/tooltip";

function FilterLikeControl() {
  return (
    <TooltipProvider>
      <AppMenu>
        <Hint label="Filter">
          <AppMenuTrigger asChild>
            <button type="button">Filter</button>
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent>
          <AppMenuItem>Workbench</AppMenuItem>
        </AppMenuContent>
      </AppMenu>
    </TooltipProvider>
  );
}

describe("Hint around AppMenuTrigger", () => {
  it("does not loop when Hint wraps a menu trigger (startup Filter/Add)", () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    expect(() =>
      render(
        <StrictMode>
          <FilterLikeControl />
        </StrictMode>,
      ),
    ).not.toThrow();
    spy.mockRestore();
    expect(errors.join("\n")).not.toMatch(/Maximum update depth/);
  });
});
