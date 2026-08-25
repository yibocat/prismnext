import type { GhAuthStatus, GhPrCreateInput } from "./types";

export type GhPrCreateFields = Omit<GhPrCreateInput, "projectRoot">;

export function parseGhAuthStatus(input: {
  installed: boolean;
  exitCode: number;
  output: string;
}): GhAuthStatus {
  if (!input.installed) {
    return { installed: false, authenticated: false, error: "gh is not installed" };
  }
  const output = input.output.trim();
  if (input.exitCode !== 0) {
    return {
      installed: true,
      authenticated: false,
      error: output.split("\n").map((line) => line.trim()).find(Boolean) || output,
    };
  }
  const match = output.match(/logged in to \S+ (?:account |as )(\S+)/i);
  return {
    installed: true,
    authenticated: true,
    username: match?.[1]?.replace(/[()]/g, "") || undefined,
  };
}

export function parseGhPrCreateOutput(
  stdout: string,
  stderr: string,
): { url?: string; number?: number } {
  const text = `${stdout}\n${stderr}`;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { url?: unknown; number?: unknown };
      const url = typeof parsed.url === "string" ? parsed.url : undefined;
      const number = typeof parsed.number === "number" ? parsed.number : pullNumberFromUrl(url);
      if (url || number != null) return { url, number };
    } catch {
      /* fall through to URL scan */
    }
  }
  const urlMatch = text.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
  if (!urlMatch) return {};
  return { url: urlMatch[0], number: Number(urlMatch[1]) };
}

function pullNumberFromUrl(url: string | undefined): number | undefined {
  const match = url?.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

export function buildGhPrCreateArgs(input: GhPrCreateFields): string[] {
  const args = [
    "pr",
    "create",
    "--base",
    input.base,
    "--head",
    input.head,
    "--title",
    input.title,
  ];
  const body = input.body?.trim();
  if (body) args.push("--body", body);
  else args.push("--fill");
  if (input.draft) args.push("--draft");
  args.push("--json", "url,number");
  return args;
}

export function formatGhPrCreateCommand(input: GhPrCreateFields): string {
  const parts = [
    "gh",
    "pr",
    "create",
    "--base",
    shellQuote(input.base),
    "--head",
    shellQuote(input.head),
    "--title",
    shellQuote(input.title),
  ];
  const body = input.body?.trim();
  if (body) parts.push("--body", shellQuote(body));
  else parts.push("--fill");
  if (input.draft) parts.push("--draft");
  return parts.join(" ");
}

function shellQuote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function firstCommitSubject(message: string): string {
  return message.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
}

export function pickDefaultBranch(branches: string[]): string {
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  return branches[0] ?? "main";
}

export function formatAskAgentPrPrompt(input: {
  head: string;
  base: string;
  title?: string;
}): string {
  const lines = [
    "Create a GitHub pull request for this repository with the GitHub CLI (`gh pr create`).",
    "",
    `- Head branch: ${input.head}`,
    `- Base branch: ${input.base}`,
  ];
  if (input.title?.trim()) lines.push(`- Suggested title: ${input.title.trim()}`);
  lines.push(
    "",
    "Use `gh pr create`. Do not add extra commits unless the branch is still ahead of its upstream. When the PR exists, open it in the browser.",
  );
  return lines.join("\n");
}
