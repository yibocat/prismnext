import { describe, expect, it } from "vitest";
import {
  parseFlatMetricsJsonText,
  parseFlatMetricsObject,
  pickMetricsArtifactPaths,
} from "../../src/shared/experiment-metrics";

describe("experiment-metrics", () => {
  it("parseFlatMetricsObject keeps numbers and short strings", () => {
    expect(
      parseFlatMetricsObject({
        acc: 0.91,
        note: "ok",
        nested: { a: 1 },
        arr: [1],
        long: "x".repeat(201),
      }),
    ).toEqual({ acc: 0.91, note: "ok" });
  });

  it("parseFlatMetricsJsonText rejects invalid JSON", () => {
    expect(parseFlatMetricsJsonText("{")).toBeNull();
    expect(parseFlatMetricsJsonText("[]")).toBeNull();
    expect(parseFlatMetricsJsonText('{"loss": 0.2}')).toEqual({ loss: 0.2 });
  });

  it("pickMetricsArtifactPaths prefers *metric*.json", () => {
    expect(
      pickMetricsArtifactPaths(["results/out.json", "results/metrics.json", "fig.png"]),
    ).toEqual(["results/metrics.json"]);
    expect(pickMetricsArtifactPaths(["a/b.json", "c.png"])).toEqual(["a/b.json"]);
    expect(pickMetricsArtifactPaths(["fig.png"])).toEqual([]);
  });
});
