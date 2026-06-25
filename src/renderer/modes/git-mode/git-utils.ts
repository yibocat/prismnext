import type { GitCommitData } from "@/stores/git-store";

// ─── Types ───

export interface CommitFile {
  path: string;
  added: number;
  deleted: number;
}

export interface RefBadge {
  label: string;
  colorClass: string;
}

// ─── formatRelativeTime ───

export function formatRelativeTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0) return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (diff < 60) return "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── groupByDate ───

export function groupByDate(commits: GitCommitData[]) {
  const groups = new Map<string, { dateKey: string; label: string; commits: GitCommitData[] }>();
  const now = new Date();
  const todayKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = [yesterday.getFullYear(), String(yesterday.getMonth() + 1).padStart(2, "0"), String(yesterday.getDate()).padStart(2, "0")].join("-");

  for (const c of commits) {
    const d = new Date(c.date);
    const key = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
    if (!groups.has(key)) {
      let label: string;
      if (key === todayKey) label = "Today";
      else if (key === yesterdayKey) label = "Yesterday";
      else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      groups.set(key, { dateKey: key, label, commits: [] });
    }
    groups.get(key)!.commits.push(c);
  }

  return [...groups.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ─── parseRefs ───

export function parseRefs(refs: string): RefBadge[] {
  if (!refs) return [];
  const parts = refs.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: RefBadge[] = [];

  for (const part of parts) {
    if (part.includes("->")) {
      // "HEAD -> main" — emit both HEAD and the branch
      const branch = part.split("->")[1].trim();
      if (!seen.has("HEAD")) {
        seen.add("HEAD");
        result.push({ label: "HEAD", colorClass: "text-amber-500 dark:text-amber-400" });
      }
      if (!seen.has(branch)) {
        seen.add(branch);
        result.push({ label: branch, colorClass: "text-sky-500 dark:text-sky-400" });
      }
      continue;
    }

    let label: string;
    let colorClass: string;

    if (part.startsWith("tag:")) {
      label = part.slice(4).trim();
      colorClass = "text-pink-500 dark:text-pink-400";
    } else if (part === "HEAD") {
      label = "HEAD";
      colorClass = "text-amber-500 dark:text-amber-400";
    } else if (part.includes("/")) {
      label = part;
      colorClass = "text-emerald-500 dark:text-emerald-400";
    } else {
      label = part;
      colorClass = "text-sky-500 dark:text-sky-400";
    }

    if (seen.has(label)) continue;
    seen.add(label);
    result.push({ label, colorClass });
  }

  return result;
}

/** Pill background for ref badges in commit metadata. */
export function refBadgePillClass(ref: RefBadge): string {
  if (ref.colorClass.includes("amber")) {
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
  if (ref.colorClass.includes("pink")) {
    return "bg-pink-500/15 text-pink-600 dark:text-pink-400";
  }
  if (ref.colorClass.includes("sky")) {
    return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
  }
  return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
}

/** First line of a commit message for compact headers. */
export function commitSubjectLine(message: string): string {
  const line = message.split("\n")[0]?.trim();
  return line || message.trim();
}

// ─── parseStatFiles ───

export function parseStatFiles(raw: string): CommitFile[] {
  const isNumstat = raw.includes("\t");

  if (isNumstat) {
    const files: CommitFile[] = [];
    for (const line of raw.split("\n")) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        files.push({
          path: parts[2],
          added: parseInt(parts[0], 10) || 0,
          deleted: parseInt(parts[1], 10) || 0,
        });
      }
    }
    return files;
  }

  // Legacy format: git show --stat
  const files: CommitFile[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) break;
    const bar = line.indexOf(" | ");
    if (bar === -1) continue;
    const path = line.slice(0, bar).trim();
    const changes = line.slice(bar + 3).trim();
    let added = 0;
    let deleted = 0;
    for (const ch of changes) {
      if (ch === "+") added++;
      else if (ch === "-") deleted++;
    }
    files.push({ path, added, deleted });
  }
  return files;
}
