/** Host payload layout on the server: `~/.prismnext-host/current`. */

export function hostPayloadBinDir(currentDir: string): string {
  return `${normalizeHostDir(currentDir)}/bin`;
}

export function hostPayloadGitBinDir(currentDir: string): string {
  return `${normalizeHostDir(currentDir)}/vendor/git/bin`;
}

export function hostPayloadGitExecDir(currentDir: string): string {
  return `${normalizeHostDir(currentDir)}/vendor/git/libexec/git-core`;
}

function normalizeHostDir(currentDir: string): string {
  return currentDir.replace(/\\/g, "/").replace(/\/+$/, "");
}
