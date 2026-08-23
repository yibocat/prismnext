/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Bot } from "lucide-react";
import { LeftNavButton, LeftNavIconButton } from "@/components/layout/left-nav-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LeftNavDefinition } from "@/lib/workspace/left-nav";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const item: LeftNavDefinition = {
  id: "new-agent",
  section: "primary",
  label: "New Agent",
  icon: Bot,
  order: 0,
  isActive: () => false,
  activate: () => {},
};

describe("LeftNavButton icons", () => {
  it("renders a Lucide forwardRef icon as <Icon />, not as a child object", () => {
    expect(typeof Bot).toBe("object");
    expect(Bot).toEqual(expect.objectContaining({ $$typeof: expect.anything(), render: expect.any(Function) }));
    expect(() =>
      render(<LeftNavButton item={item} panelRefs={{}} />),
    ).not.toThrow();
  });

  it("renders the footer icon button the same way", () => {
    expect(() =>
      render(
        <TooltipProvider>
          <LeftNavIconButton item={{ ...item, id: "settings" }} panelRefs={{}} />
        </TooltipProvider>,
      ),
    ).not.toThrow();
  });
});
