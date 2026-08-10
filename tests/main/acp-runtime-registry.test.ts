import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: () => "/tmp/prismnext-runtime-test",
  },
}));

vi.mock("electron-store", () => ({
  default: class {
    get() { return undefined; }
    set() {}
    store = {};
  },
}));

import { AcpService } from "../../src/main/acp/service";

describe("AcpService project runtime registry", () => {
  afterEach(() => {
    AcpService.__resetProjectRuntimesForTests();
  });

  it("reuses one runtime per project and isolates distinct project runtime directories", () => {
    const projectA = "/tmp/prismnext-project-a";
    const projectB = "/tmp/prismnext-project-b";

    const firstA = AcpService.getInstanceForProject(projectA);
    const againA = AcpService.getInstanceForProject(projectA);
    const serviceB = AcpService.getInstanceForProject(projectB);

    expect(againA).toBe(firstA);
    expect(serviceB).not.toBe(firstA);
    expect(firstA.getProjectPath()).toBe(projectA);
    expect(serviceB.getProjectPath()).toBe(projectB);
    expect((firstA as any).getServerDataDir()).not.toBe((serviceB as any).getServerDataDir());
    expect((firstA as any).getOpencodeAgentsDir()).not.toBe((serviceB as any).getOpencodeAgentsDir());
  });
});
