import { describe, expect, it } from "vitest";
import { RemoteOperationError } from "../../src/shared/remote";
import { createAuthFailSshClient, createDirectoryBackedSshClient } from "../../src/main/remote/ssh-client";

describe("SshClient fakes", () => {
  it("maps authentication failure to ssh_auth", async () => {
    const client = createAuthFailSshClient();
    await expect(
      client.connect({
        host: "lab",
        port: 22,
        user: "me",
        onHostKey: () => "accept",
      }),
    ).rejects.toMatchObject({ code: "ssh_auth" } satisfies Partial<RemoteOperationError>);
  });

  it("directory backend refuses an unknown host key", async () => {
    const client = createDirectoryBackedSshClient("/tmp");
    await expect(
      client.connect({
        host: "lab",
        port: 22,
        user: "me",
        onHostKey: () => "unknown",
      }),
    ).rejects.toMatchObject({ code: "host_key_unknown" });
  });
});
