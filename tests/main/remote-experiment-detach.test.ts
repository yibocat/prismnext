import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  attachDetachedJob,
  cancelDetachedJob,
  startDetachedJob,
} from "../../src/main/experiment/detached-job";

describe("detached experiment job", () => {
  const jobs: string[] = [];

  afterEach(() => {
    for (const id of jobs) {
      try {
        cancelDetachedJob(id, home);
      } catch {
        // ignore
      }
    }
    jobs.length = 0;
  });

  const home = mkdtempSync(join(tmpdir(), "prism-detach-"));

  it("keeps running after start() returns and attach can read the tail", async () => {
    const id = `job-${Date.now()}`;
    jobs.push(id);
    startDetachedJob({
      executionId: id,
      command: "for i in 1 2 3 4; do echo line$i; sleep 0.2; done",
      cwd: home,
      projectId: home,
      home,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const view = attachDetachedJob(id, 0, home);
    expect(view?.running).toBe(true);
    expect(view?.tail).toMatch(/line1/);
    cancelDetachedJob(id, home);
  });
});
