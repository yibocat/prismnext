import { describe, expect, it } from "vitest";
import { classifySshError, systemSshArgv } from "../../src/main/remote/system-ssh-client";

describe("systemSshArgv", () => {
  it("keeps the remote script as one argument after -- dest", () => {
    const script = 'printf %s "$HOME"';
    expect(systemSshArgv("lab.example", script)).toEqual([
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      "-o",
      "StrictHostKeyChecking=yes",
      "--",
      "lab.example",
      script,
    ]);
  });

  it("does not split sh -c so $HOME survives OpenSSH argv joining", () => {
    const argv = systemSshArgv("lab", 'printf %s "$HOME"');
    const destAt = argv.indexOf("lab");
    expect(argv[destAt - 1]).toBe("--");
    expect(argv.slice(destAt + 1)).toEqual(['printf %s "$HOME"']);
    expect(argv.includes("sh")).toBe(false);
    expect(argv.includes("-c")).toBe(false);
  });
});

describe("classifySshError", () => {
  it("maps a missing ssh binary", () => {
    expect(classifySshError("spawn ssh ENOENT", "ENOENT")).toBe("ssh_missing");
    expect(classifySshError("ssh: command not found", 127)).toBe("ssh_missing");
  });

  it("maps jump-host failures from OpenSSH", () => {
    expect(classifySshError("ssh: Could not resolve hostname jump: ProxyJump failed", 255)).toBe("ssh_jump");
    expect(classifySshError("kex_exchange_identification: Connection closed by remote host", 255)).toBe(
      "ssh_jump",
    );
  });
});

