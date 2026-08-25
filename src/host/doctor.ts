import { accessSync, constants } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { HostDoctorReport } from "../shared/remote";
import { WORKBENCH_HOME_DIRNAME } from "../shared/workbench/paths";

export type { HostDoctorReport };

const execFileAsync = promisify(execFile);

async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync("git", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<HostDoctorReport> {
  const home = homedir();
  let homeWritable = false;
  try {
    accessSync(home, constants.W_OK);
    homeWritable = true;
  } catch {
    homeWritable = false;
  }
  const git = await hasGit();
  return {
    ok: homeWritable,
    node: process.version,
    home: `${home.replace(/\\/g, "/")}/${WORKBENCH_HOME_DIRNAME}`,
    homeWritable,
    git,
  };
}
