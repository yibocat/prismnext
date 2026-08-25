import { spawn } from "node:child_process";
import {
  buildGhPrCreateArgs,
  parseGhAuthStatus,
  parseGhPrCreateOutput,
} from "../../shared/git-hosting";
import type { GhAuthStatus, GhPrCreateInput, GhPrCreateResult, GhPrViewWebResult } from "../../shared/git-hosting";

export interface GhRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  notFound?: boolean;
}

export type GhRunner = (cwd: string, args: string[]) => Promise<GhRunResult>;

const GH_TIMEOUT_MS = 60_000;

export async function runGh(cwd: string, args: string[]): Promise<GhRunResult> {
  return new Promise((resolve) => {
    const proc = spawn("gh", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (result: GhRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, GH_TIMEOUT_MS);

    proc.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => {
      const notFound = (err as NodeJS.ErrnoException).code === "ENOENT";
      finish({
        exitCode: 1,
        stdout,
        stderr: stderr || err.message,
        notFound,
      });
    });
    proc.on("close", (code) => {
      finish({
        exitCode: timedOut ? -1 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

export async function ghAuthStatus(
  cwd: string,
  run: GhRunner = runGh,
): Promise<GhAuthStatus> {
  const version = await run(cwd, ["--version"]);
  if (version.notFound) {
    return parseGhAuthStatus({ installed: false, exitCode: 1, output: "" });
  }
  const auth = await run(cwd, ["auth", "status"]);
  return parseGhAuthStatus({
    installed: true,
    exitCode: auth.exitCode,
    output: `${auth.stdout}\n${auth.stderr}`,
  });
}

export async function ghPrCreate(
  input: GhPrCreateInput,
  run: GhRunner = runGh,
): Promise<GhPrCreateResult> {
  const result = await run(input.projectRoot, buildGhPrCreateArgs(input));
  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.notFound) {
    return { success: false, error: "gh is not installed", output: combined };
  }
  if (result.exitCode !== 0) {
    return {
      success: false,
      error: combined || "gh pr create failed",
      output: combined,
    };
  }
  const parsed = parseGhPrCreateOutput(result.stdout, result.stderr);
  return {
    success: true,
    url: parsed.url,
    number: parsed.number,
    output: result.stdout.trim() || combined,
  };
}

export async function ghPrViewWeb(
  cwd: string,
  opts: { url?: string } = {},
  run: GhRunner = runGh,
): Promise<GhPrViewWebResult> {
  const args = opts.url
    ? ["pr", "view", opts.url, "--web"]
    : ["pr", "view", "--web"];
  const result = await run(cwd, args);
  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.notFound) {
    return { success: false, error: "gh is not installed", output: combined };
  }
  if (result.exitCode !== 0) {
    return { success: false, error: combined || "gh pr view failed", output: combined };
  }
  return { success: true, output: combined || undefined };
}
