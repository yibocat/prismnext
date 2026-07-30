import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComposerChromeStackBody } from "../../src/renderer/components/modules/chat/composer-chrome-stack-body";

describe("ComposerChromeStackBody", () => {
  it("renders a single item without stack chrome", () => {
    render(
      <ComposerChromeStackBody
        items={[{
          id: "one",
          order: 10,
          peekLabel: "One",
          content: <div>Only card</div>,
        }]}
      />,
    );
    expect(screen.getByText("Only card")).toBeTruthy();
  });

  it("renders the front card when multiple items are stacked", () => {
    render(
      <ComposerChromeStackBody
        items={[
          { id: "front", order: 10, peekLabel: "Front", content: <div>Front card</div> },
          { id: "back", order: 20, peekLabel: "Back card", content: <div>Back card</div> },
        ]}
      />,
    );
    expect(screen.getByText("Front card")).toBeTruthy();
    expect(screen.getByText("Back card")).toBeTruthy();
  });
});
