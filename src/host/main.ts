import { runDoctor } from "./doctor";
import { buildHandshake, readHostStamp } from "./stamp";
import { serveListen } from "./serve-listen";
import { serveStdio } from "./serve-stdio";

function listenBindFrom(args: string[]): string | null {
  const flag = args.indexOf("--listen");
  if (flag < 0) return null;
  const value = args[flag + 1];
  return value && !value.startsWith("-") ? value : null;
}

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
  const listenBind = command === "serve" ? listenBindFrom(args) : null;
  if (command === "serve" && listenBind) {
    await serveListen({
      handshake: buildHandshake(readHostStamp()),
      bind: listenBind,
      listenFile: process.env.PRISM_HOST_LISTEN_FILE,
    });
    return;
  }
  process.stderr.write("usage: prismnext-host <doctor | serve --stdio | serve --listen 127.0.0.1:port>\n");
  process.exitCode = 1;
}

void main(process.argv);
