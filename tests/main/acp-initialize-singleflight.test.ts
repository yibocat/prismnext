import { describe, expect, it } from "vitest";

/**
 * Mirrors AcpService.initialize() single-flight: overlapping callers must share
 * one exclusive run so a late caller cannot shutdown() mid-handshake.
 */
function createSingleFlightInitialize(exclusive: () => Promise<void>) {
  let initInflight: Promise<void> | null = null;
  let conn = false;

  async function initialize(): Promise<void> {
    for (;;) {
      while (initInflight) {
        try {
          await initInflight;
        } catch {
          /* shared attempt failed — re-evaluate */
        }
      }
      if (conn) return;
      if (initInflight) continue;
      const run = exclusive().then(() => {
        conn = true;
      });
      initInflight = run.finally(() => {
        initInflight = null;
      });
      await run;
      return;
    }
  }

  return { initialize, isReady: () => conn };
}

describe("ACP initialize single-flight", () => {
  it("runs exclusive spawn once when two callers overlap", async () => {
    let exclusiveStarts = 0;
    let exclusiveActive = 0;
    let maxExclusiveActive = 0;

    const { initialize, isReady } = createSingleFlightInitialize(async () => {
      exclusiveStarts += 1;
      exclusiveActive += 1;
      maxExclusiveActive = Math.max(maxExclusiveActive, exclusiveActive);
      await new Promise((r) => setTimeout(r, 30));
      exclusiveActive -= 1;
    });

    await Promise.all([initialize(), initialize(), initialize()]);

    expect(exclusiveStarts).toBe(1);
    expect(maxExclusiveActive).toBe(1);
    expect(isReady()).toBe(true);
  });

  it("lets a waiter succeed after a failed shared attempt retries", async () => {
    let exclusiveStarts = 0;
    const { initialize, isReady } = createSingleFlightInitialize(async () => {
      exclusiveStarts += 1;
      if (exclusiveStarts === 1) {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error("ACP connection closed");
      }
    });

    const first = initialize().catch((e: Error) => e.message);
    await new Promise((r) => setTimeout(r, 0));
    const second = initialize().catch((e: Error) => e.message);

    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe("ACP connection closed");
    // Second joins the failed attempt, then retries and succeeds.
    expect(b).toBeUndefined();
    expect(isReady()).toBe(true);
    expect(exclusiveStarts).toBe(2);
  });
});
