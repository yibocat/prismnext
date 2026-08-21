import { afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setWorkbenchUserHomeOverride } from "../../../src/main/workbench/home";
import { mintProjectId, writeWorkbenchJson } from "../../../src/main/workbench/identity";
import { libraryRel } from "../../../src/shared/workbench-paths";

const temps: string[] = [];
let home: string | null = null;

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  home = null;
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function ensureHome(): string {
  if (home) return home;
  home = mkdtempSync(join(tmpdir(), "wb-lit-home-"));
  temps.push(home);
  setWorkbenchUserHomeOverride(home);
  return home;
}

/** Paper folder with workbench.json; library writes go to the temp workbench home. */
export function tempLiteratureProject(id?: string): string {
  ensureHome();
  const root = mkdtempSync(join(tmpdir(), "wb-lit-paper-"));
  temps.push(root);
  writeWorkbenchJson(root, { id: id ?? mintProjectId() });
  return root;
}

export function tempLiteratureLibraryDir(projectId: string): string {
  return join(ensureHome(), libraryRel(projectId));
}

export function tempWorkbenchHome(): string {
  return ensureHome();
}
