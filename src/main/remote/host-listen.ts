import { createConnection } from "node:net";
import type { SshExecResult, SshSession, SshStdioPipe } from "./ssh-client";

export function buildHostEnsureListenScript(boot: {
  nodeBin: string;
  hostBin: string;
  currentDir?: string;
}): string {
  const currentDir = (boot.currentDir ?? boot.hostBin.replace(/\/bin\/prismnext-host$/, "")).replace(
    /\\/g,
    "/",
  );
  const nodeBin = boot.nodeBin.replace(/\\/g, "/");
  const hostBin = boot.hostBin.replace(/\\/g, "/");
  const teamsDir = `${currentDir}/resources/teams`;
  const commandsDir = `${currentDir}/resources/commands`;
  const listenFile = `${currentDir}/listen.json`;
  const js = [
    "const {spawn}=require('child_process');",
    "const fs=require('fs');",
    "const net=require('net');",
    `const node=${JSON.stringify(nodeBin)};`,
    `const host=${JSON.stringify(hostBin)};`,
    `const file=${JSON.stringify(listenFile)};`,
    `const teams=${JSON.stringify(teamsDir)};`,
    `const commands=${JSON.stringify(commandsDir)};`,
    "function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}",
    "function wait(port,done){const t=Date.now();(function tick(){const c=net.connect({host:'127.0.0.1',port},()=>{c.end();done();});c.on('error',()=>{if(Date.now()-t>8000){process.stderr.write('listen timeout');process.exit(1);}setTimeout(tick,80);});})();}",
    "function start(){const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>{const child=spawn(node,[host,'serve','--listen','127.0.0.1:'+port],{detached:true,stdio:'ignore',env:Object.assign({},process.env,{PRISM_FIRST_PARTY_TEAMS_DIR:teams,PRISM_APP_COMMANDS_DIR:commands,PRISM_HOST_LISTEN_FILE:file})});child.unref();wait(port,()=>{fs.writeFileSync(file,JSON.stringify({port:port,pid:child.pid,bind:'127.0.0.1'}));process.stdout.write(String(port));});});});}",
    "try{const prev=JSON.parse(fs.readFileSync(file,'utf8'));if(prev.port&&prev.pid&&alive(prev.pid)){wait(prev.port,()=>{process.stdout.write(String(prev.port));process.exit(0);});}else start();}catch{start();}",
  ].join("");
  return `${JSON.stringify(nodeBin)} -e ${JSON.stringify(js)}`;
}

export function parseListenPort(result: SshExecResult): number | null {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  const match = text.match(/\b(\d{2,5})\b/);
  if (!match) return null;
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

export async function waitForTcp(port: number, host = "127.0.0.1", timeoutMs = 8_000): Promise<void> {
  const start = Date.now();
  let last: Error | undefined;
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host, port }, () => {
          socket.end();
          resolve();
        });
        socket.setTimeout(400);
        socket.once("error", reject);
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("timeout"));
        });
      });
      return;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  throw last ?? new Error(`127.0.0.1:${port} did not accept connections.`);
}

export function tcpPipe(port: number, host = "127.0.0.1"): Promise<SshStdioPipe> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port }, () => {
      resolve({
        stdin: socket,
        stdout: socket,
        stderr: socket,
        close: async () => {
          socket.destroy();
        },
      });
    });
    socket.once("error", reject);
  });
}

export async function ensureRemoteListenPort(
  session: SshSession,
  boot: { nodeBin: string; hostBin: string; currentDir?: string },
): Promise<number | null> {
  const started = await session.exec(buildHostEnsureListenScript(boot));
  if (started.code !== 0) return null;
  return parseListenPort(started);
}
