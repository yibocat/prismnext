import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getUserDataPath } from "../app/paths";

const ZSH_RC = `# prismnext terminal shell integration (OSC 133)
if [[ -z "$PRISM_ZDOTDIR_SOURCED" ]]; then
  export PRISM_ZDOTDIR_SOURCED=1
  if [[ -f "$HOME/.zshrc" ]]; then
    source "$HOME/.zshrc"
  fi
fi

__prism_osc() { printf '\\033]133;%s\\007' "$1"; }

__prism_preexec() { __prism_osc "C"; }
__prism_precmd() {
  __prism_osc "D;$?"
  __prism_osc "A"
}

if (( $+functions[add-zsh-hook] )); then
  add-zsh-hook preexec __prism_preexec
  add-zsh-hook precmd __prism_precmd
else
  precmd_functions+=(__prism_precmd)
  preexec_functions+=(__prism_preexec)
fi
`;

const BASH_RC = `# prismnext terminal shell integration (OSC 133)
if [[ -z "$PRISM_BASHRC_SOURCED" ]]; then
  export PRISM_BASHRC_SOURCED=1
  if [[ -f "$HOME/.bashrc" ]]; then
    source "$HOME/.bashrc"
  fi
fi

__prism_osc() { printf '\\033]133;%s\\007' "$1"; }

__prism_preexec() { __prism_osc "C"; }
__prism_prompt_hook() {
  __prism_osc "D;$?"
  __prism_osc "A"
}

if [[ -z "$PRISM_PROMPT_HOOK" ]]; then
  export PRISM_PROMPT_HOOK=1
  __prism_prev_prompt_command="$PROMPT_COMMAND"
  PROMPT_COMMAND='__prism_prompt_hook'
fi

if [[ -n "$BASH_VERSION" ]]; then
  trap '__prism_osc "C"' DEBUG
fi
`;

let cachedBaseDir: string | null = null;

function ensureIntegrationFiles(): string {
  const base = join(getUserDataPath(), "terminal-integration");
  const zshDir = join(base, "zsh");
  const bashDir = join(base, "bash");

  mkdirSync(zshDir, { recursive: true });
  mkdirSync(bashDir, { recursive: true });

  // Always rewrite so integration script updates ship without manual cleanup.
  writeFileSync(join(zshDir, ".zshrc"), ZSH_RC, "utf8");
  writeFileSync(join(bashDir, "bashrc"), BASH_RC, "utf8");

  cachedBaseDir = base;
  return base;
}

export interface ShellIntegrationLaunch {
  env: Record<string, string>;
  args: string[];
}

/** Configure shell launch args/env for OSC 133 integration when supported. */
export function getShellIntegrationLaunch(shell: string): ShellIntegrationLaunch {
  const base = ensureIntegrationFiles();
  const name = shell.split("/").pop() ?? shell;

  if (name === "zsh") {
    return {
      env: {
        ZDOTDIR: join(base, "zsh"),
        PRISM_SHELL_INTEGRATION: "1",
      },
      args: [],
    };
  }

  if (name === "bash") {
    return {
      env: {
        PRISM_SHELL_INTEGRATION: "1",
      },
      args: ["--rcfile", join(base, "bash", "bashrc")],
    };
  }

  return { env: {}, args: [] };
}
