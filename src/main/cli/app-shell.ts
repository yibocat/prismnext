// src/main/cli/app-shell.ts
// Layer 1 — Prism application-level system prompt and PATH augmentation.
// Migrated from services/claude.ts (old architecture).

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Prism's application-level system prompt — injected into every agent
 *  process so the AI knows it's operating inside a LaTeX editor. */
export const APP_SYSTEM_PROMPT = [
  "You are an AI assistant integrated into a LaTeX document editor (Prism). ",
  "Follow these rules strictly:\n",
  "1. PLANNING FIRST: Before making changes, use TodoWrite to create a step-by-step plan. ",
  "Break large tasks into small, incremental steps (one section or one logical unit per step).\n",
  "2. INCREMENTAL EDITS: Use the Edit tool to make small, targeted changes — one step at a time. ",
  "NEVER write or rewrite an entire file at once. Always prefer editing existing content over replacing it wholesale.\n",
  "3. STEP BY STEP: After each edit, mark the todo item as completed, then proceed to the next step. ",
  "This lets the user review changes incrementally.\n",
  "4. PRESERVE EXISTING CONTENT: Always read the file first. Keep the existing preamble, packages, ",
  "and structure intact. Only add or modify what is needed for the current step.\n",
  "5. LaTeX BEST PRACTICES: Use proper sectioning (\\chapter, \\section, \\subsection), ",
  "citations (\\cite), cross-references (\\label, \\ref), and BibTeX for bibliographies.\n",
  "6. SKILLS: If scientific skills are installed in .claude/skills/, follow their guidelines ",
  "for domain-specific tasks. Use skill-provided LaTeX packages (.sty) and code patterns.\n",
  "7. PYTHON: If a .venv/ exists in the project, it is already activated. ",
  "Use `uv pip install` to add packages and `python` to run scripts.",
].join("");

/** Build an augmented PATH string for the child process. Prepends common
 *  tool directories (nvm, pnpm, cargo, venv, homebrew) so the agent CLI
 *  can find binaries that aren't on the system PATH. */
export function buildAugmentedPath(cwd: string): string {
  const home = homedir();
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = (process.env.PATH || "").split(sep).filter(Boolean);

  const extras: string[] = [];

  // PNPM_HOME
  const pnpmHome = process.env.PNPM_HOME;
  if (pnpmHome) extras.push(pnpmHome);

  // NVM_BIN or latest NVM version
  const nvmBin = process.env.NVM_BIN;
  if (nvmBin) {
    extras.push(nvmBin);
  } else {
    const nvmDir = join(home, ".nvm", "versions", "node");
    if (existsSync(nvmDir)) {
      try {
        const versions = readdirSync(nvmDir).sort().reverse();
        if (versions.length > 0) extras.push(join(nvmDir, versions[0], "bin"));
      } catch {}
    }
  }

  // venv
  const venvDir = join(cwd, ".venv");
  if (existsSync(venvDir)) {
    extras.push(process.platform === "win32" ? join(venvDir, "Scripts") : join(venvDir, "bin"));
  }

  // Standard tool paths
  for (const dir of [
    join(home, ".local", "bin"),
    join(home, ".cargo", "bin"),
    join(home, ".bun", "bin"),
    join(home, "Library", "pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ]) {
    if (existsSync(dir) && !parts.includes(dir) && !extras.includes(dir)) {
      extras.push(dir);
    }
  }

  // Prepend extras that aren't already in PATH
  for (const dir of extras.reverse()) {
    if (!parts.includes(dir)) parts.unshift(dir);
  }

  return parts.join(sep);
}
