/**
 * Long-lived Tectonic compile loop (spawned by tectonic-daemon.ts).
 * Env: PRISM_TECTONIC_PATH, PRISM_BUILD_DIR, PRISM_MAIN_FILE
 * Stdin: FAST | FULL | QUIT
 * Stdout: DONE:<exitCode>
 */
import { spawn } from "node:child_process";

const tectonic = process.env.PRISM_TECTONIC_PATH;
const buildDir = process.env.PRISM_BUILD_DIR;
const mainFile = process.env.PRISM_MAIN_FILE;

if (!tectonic || !buildDir || !mainFile) {
  console.error("tectonic-daemon-worker: missing PRISM_* env");
  process.exit(1);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    if (line === "QUIT") process.exit(0);

    const fast = line === "FAST";
    const args = ["--keep-logs", "--keep-intermediates", "--outdir", buildDir];
    if (fast) args.push("-r", "0");
    args.push(mainFile);

    const proc = spawn(tectonic, args, {
      cwd: buildDir,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    proc.stderr?.on("data", () => {});
    proc.on("close", (code) => {
      process.stdout.write(`DONE:${code ?? 1}\n`);
    });
    proc.on("error", () => {
      process.stdout.write("DONE:1\n");
    });
  }
});
