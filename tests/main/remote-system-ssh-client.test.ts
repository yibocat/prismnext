import { describe, expect, it } from "vitest";
import {
  classifySshError,
  parseRemoteStatStdout,
  systemSshArgv,
} from "../../src/main/remote/system-ssh-client";

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

describe("parseRemoteStatStdout", () => {
  it("does not treat a missing file as size 0 (empty stdout still exits 0)", () => {
    // Production used `if [ -e p ]; then wc -c < p; fi`. Missing → code 0, stdout "".
    // Number("") === 0, so inventory thought tectonic existed and skipped install.
    expect(Number("")).toBe(0);
    expect(parseRemoteStatStdout(0, "")).toBeNull();
    expect(parseRemoteStatStdout(0, "   \n")).toBeNull();
    expect(parseRemoteStatStdout(1, "0")).toBeNull();
  });

  it("parses wc -c output for a real file", () => {
    expect(parseRemoteStatStdout(0, "19\n")).toEqual({ size: 19 });
    expect(parseRemoteStatStdout(0, "  120243200\n")).toEqual({ size: 120243200 });
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

