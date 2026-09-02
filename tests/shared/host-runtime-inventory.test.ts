import { describe, expect, it } from "vitest";
import {
  hostRuntimePinsFromFiles,
  inventoryMissingSteps,
  parseHostPinMap,
  runtimeBinFromStat,
  type HostRuntimeInventory,
} from "../../src/shared/remote/host-runtime-env";

function bin(available: boolean, version: string | null = null): HostRuntimeInventory["node"] {
  return { available, version, path: available ? "/bin/x" : null };
}

function inventory(partial: Partial<HostRuntimeInventory>): HostRuntimeInventory {
  return {
    node: bin(true, "24.19.0"),
    git: bin(true, "v2.53.0-3"),
    tectonic: bin(true, "0.15.0"),
    tinymist: bin(true, "0.15.2"),
    anydoc: bin(true, "0.2.4"),
    ...partial,
  };
}

const pins = {
  node: "24.19.0",
  git: "v2.53.0-3",
  tectonic: "0.15.0",
  tinymist: "0.15.2",
  anydoc: "0.2.4",
};

describe("runtimeBinFromStat", () => {
  it("treats a missing or zero-byte SSH stat as not installed", () => {
    expect(runtimeBinFromStat(null, "/bin/tectonic", "0.15.0")).toEqual({
      available: false,
      version: null,
      path: null,
    });
    expect(runtimeBinFromStat({ size: 0 }, "/bin/tectonic", "0.15.0")).toEqual({
      available: false,
      version: null,
      path: null,
    });
  });

  it("keeps a real file", () => {
    expect(runtimeBinFromStat({ size: 19 }, "/bin/tectonic", "0.15.0")).toEqual({
      available: true,
      version: "0.15.0",
      path: "/bin/tectonic",
    });
  });
});

describe("parseHostPinMap / hostRuntimePinsFromFiles", () => {
  it("reads pin files and runtime-stamp lines", () => {
    expect(parseHostPinMap("node 24.19.0\ngit v2.53.0-3\n")).toEqual({
      node: "24.19.0",
      git: "v2.53.0-3",
    });
    expect(hostRuntimePinsFromFiles({
      node: "version 24.19.0\narchive node-v{version}-linux-{arch}.tar.gz\n",
      git: "tag v2.53.0-3\n",
      tectonic: "version 0.15.0\n",
      tinymist: "version 0.15.2\n",
      anydoc: "version 0.2.4\n",
    })).toEqual(pins);
  });
});

describe("inventoryMissingSteps", () => {
  it("returns empty when all bins match the pins", () => {
    expect(inventoryMissingSteps(inventory({}), pins)).toEqual([]);
  });

  it("asks only for anydoc when that native binding is missing", () => {
    expect(inventoryMissingSteps(
      inventory({ anydoc: bin(false) }),
      pins,
    )).toEqual(["anydoc"]);
  });

  it("asks only for tinymist when that bin is missing", () => {
    expect(inventoryMissingSteps(
      inventory({ tinymist: bin(false) }),
      pins,
    )).toEqual(["tinymist"]);
  });

  it("asks only for tectonic when that bin is missing", () => {
    expect(inventoryMissingSteps(
      inventory({ tectonic: bin(false) }),
      pins,
    )).toEqual(["tectonic"]);
  });

  it("asks for node when the installed version does not match the pin", () => {
    expect(inventoryMissingSteps(
      inventory({ node: bin(true, "22.0.0") }),
      pins,
    )).toEqual(["node"]);
  });

  it("treats a v-prefixed Node version as matching a bare pin", () => {
    expect(inventoryMissingSteps(
      inventory({ node: bin(true, "v24.19.0") }),
      pins,
    )).toEqual([]);
  });

  it("does not reinstall when a bin exists but the stamp has no version yet", () => {
    expect(inventoryMissingSteps(
      inventory({
        node: bin(true, null),
        git: bin(true, null),
        tectonic: bin(true, null),
        tinymist: bin(true, null),
        anydoc: bin(true, null),
      }),
      pins,
    )).toEqual([]);
  });
});
