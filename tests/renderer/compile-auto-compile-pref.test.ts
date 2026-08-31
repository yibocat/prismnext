import { afterEach, describe, expect, it } from "vitest";
import { syncAutoCompileForProject, useCompileStore } from "../../src/renderer/stores/compile-store";
import { useDocumentStore } from "../../src/renderer/stores/document-store";

describe("compile-store autoCompile per project root", () => {
  const previousRoot = useDocumentStore.getState().projectRoot;

  afterEach(() => {
    useCompileStore.setState({
      autoCompileByRoot: {},
      localAutoCompileDefault: true,
      autoCompile: true,
    });
    useDocumentStore.setState({ projectRoot: previousRoot });
  });

  it("defaults remote off, remembers a remote toggle, and leaves local on", async () => {
    useCompileStore.setState({
      autoCompileByRoot: {},
      localAutoCompileDefault: true,
      autoCompile: true,
    });
    await Promise.resolve();

    useDocumentStore.setState({ projectRoot: "/Users/me/paper" });
    syncAutoCompileForProject("/Users/me/paper");
    expect(useCompileStore.getState().autoCompile).toBe(true);

    useDocumentStore.setState({ projectRoot: "remote://lab/home/ubuntu/paper" });
    syncAutoCompileForProject("remote://lab/home/ubuntu/paper");
    expect(useCompileStore.getState().autoCompile).toBe(false);

    useCompileStore.getState().toggleAutoCompile();
    expect(useCompileStore.getState().autoCompile).toBe(true);
    expect(useCompileStore.getState().autoCompileByRoot["remote://lab/home/ubuntu/paper"]).toBe(true);

    useDocumentStore.setState({ projectRoot: "/Users/me/paper" });
    syncAutoCompileForProject("/Users/me/paper");
    expect(useCompileStore.getState().autoCompile).toBe(true);

    useDocumentStore.setState({ projectRoot: "remote://lab/home/ubuntu/paper" });
    syncAutoCompileForProject("remote://lab/home/ubuntu/paper");
    expect(useCompileStore.getState().autoCompile).toBe(true);
  });
});
