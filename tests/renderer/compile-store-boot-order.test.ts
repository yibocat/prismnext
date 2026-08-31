import { describe, expect, it } from "vitest";
// Startup graph is document-store → project-lifecycle → compile-store.
// This file must import document-store first so the cycle matches the app.
import { useDocumentStore } from "../../src/renderer/stores/document-store";
import { useCompileStore } from "../../src/renderer/stores/compile-store";

describe("compile-store boot order", () => {
  it("loads when document-store is evaluated first", async () => {
    expect(typeof useDocumentStore.getState).toBe("function");
    expect(typeof useCompileStore.getState).toBe("function");
    await Promise.resolve();
    expect(typeof useCompileStore.getState().autoCompile).toBe("boolean");
  });
});
