import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sanitizeSshProfile } from "../../src/shared/remote";
import {
  applyProfileOverrides,
  profileModelKeys,
  writeProfileModelKeys,
} from "../../src/main/remote/profile-overrides";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

const base = {
  id: "lab",
  name: "lab",
  host: "lab.example.com",
  port: 22,
  user: "ubuntu",
  strictHostKey: true,
};

describe("remote model key mode", () => {
  afterEach(() => {
    setWorkbenchUserHomeOverride(null);
  });

  it("defaults to remote BYOK when the field is omitted", () => {
    expect(sanitizeSshProfile(base)?.modelKeys).toBeUndefined();
    expect(profileModelKeys(sanitizeSshProfile(base))).toBe("remote");
  });

  it("honors an explicit gateway override", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-keys-"));
    setWorkbenchUserHomeOverride(home);
    writeProfileModelKeys("lab", "gateway");
    const profile = applyProfileOverrides({ ...base });
    expect(profile.modelKeys).toBe("gateway");
    expect(profileModelKeys(profile)).toBe("gateway");
  });
});
