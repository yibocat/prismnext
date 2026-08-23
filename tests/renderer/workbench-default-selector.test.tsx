/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  defaultProjectAsMember,
  selectableWorkbenchProjects,
  useWorkbenchStore,
} from "@/stores/workbench-store";

function OffListDefault() {
  const member = useWorkbenchStore((s) => defaultProjectAsMember(s));
  const listed = useWorkbenchStore((s) => selectableWorkbenchProjects(s));
  return (
    <div>
      {member?.id}:{listed.length}
    </div>
  );
}

describe("default project off the workbench list", () => {
  it("does not loop when sidebar selectors read the fallback member", () => {
    useWorkbenchStore.setState({
      defaultProjectId: "p_default",
      defaultLastPath: "/Users/me/Documents/PrismNext",
      workbenchProjectIds: ["p_a"],
      members: [{ id: "p_a", lastPath: "/Users/me/papers/a", displayName: "a" }],
      loaded: true,
      focusConversationId: null,
      focusProjectId: "p_default",
      sessionProjectIds: {},
    });

    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    expect(() => render(<OffListDefault />)).not.toThrow();
    spy.mockRestore();
    expect(errors.join("\n")).not.toMatch(/Maximum update depth/);
  });
});
