import { runDoctor } from "./doctor";
import { buildHandshake, readHostStamp } from "./stamp";
import { serveStdio } from "./serve-stdio";

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const command = args[0];
  if (command === "doctor") {
    process.stdout.write(`${JSON.stringify(await runDoctor())}\n`);
    return;
  }
  if (command === "serve" && args.includes("--stdio")) {
    await serveStdio({
      stdin: process.stdin,
      stdout: process.stdout,
      handshake: buildHandshake(readHostStamp()),
    });
    return;
  }
  process.stderr.write("usage: prismnext-host <doctor | serve --stdio>\n");
  process.exitCode = 1;
}

void main(process.argv);
