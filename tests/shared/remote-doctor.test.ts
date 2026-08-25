import { describe, expect, it } from "vitest";
import {
  emptyConnectConstitution,
  isHostDoctorReport,
  lastFailedConnectGate,
  recordConnectGate,
} from "../../src/shared/remote";

describe("connect constitution", () => {
  it("records the last result per gate and finds the last failure", () => {
    let constitution = emptyConnectConstitution();
    constitution = recordConnectGate(constitution, { gate: "ssh", ok: true, detail: "up" });
    constitution = recordConnectGate(constitution, { gate: "runtime", ok: false, detail: "no node" });
    constitution = recordConnectGate(constitution, { gate: "runtime", ok: false, detail: "still no node" });
    expect(constitution.gates).toHaveLength(2);
    expect(lastFailedConnectGate(constitution)).toEqual({
      gate: "runtime",
      ok: false,
      detail: "still no node",
    });
  });

  it("accepts a host doctor report and rejects extras that omit checks", () => {
    expect(
      isHostDoctorReport({
        ok: true,
        node: "v20.0.0",
        home: "/home/ubuntu/.prismnext",
        homeWritable: true,
        git: false,
      }),
    ).toBe(true);
    expect(isHostDoctorReport({ ok: true, node: "v20.0.0" })).toBe(false);
  });
});
