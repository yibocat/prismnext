import { createElement, type ReactNode } from "react";
import { vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

if (typeof Element !== "undefined" && typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollToPolyfill(
    this: Element,
    arg?: number | ScrollToOptions,
    y?: number,
  ) {
    if (typeof arg === "object" && arg) {
      if (typeof arg.left === "number") this.scrollLeft = arg.left;
      if (typeof arg.top === "number") this.scrollTop = arg.top;
      return;
    }
    if (typeof arg === "number") this.scrollLeft = arg;
    if (typeof y === "number") this.scrollTop = y;
  };
}

/**
 * Production wraps the app in TooltipProvider (`src/renderer/main.tsx`).
 * Renderer tests render widgets in isolation — give them the same host.
 */
vi.mock("@testing-library/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@testing-library/react")>();
  return {
    ...actual,
    render(
      ui: Parameters<typeof actual.render>[0],
      options?: Parameters<typeof actual.render>[1],
    ) {
      const UserWrapper = options?.wrapper;
      function Wrapper({ children }: { children?: ReactNode }) {
        const inner = UserWrapper
          ? createElement(UserWrapper, null, children)
          : children;
        return createElement(TooltipProvider, null, inner);
      }
      return actual.render(ui, { ...options, wrapper: Wrapper });
    },
  };
});
