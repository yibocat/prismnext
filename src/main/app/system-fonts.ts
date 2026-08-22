// src/main/app/system-fonts.ts
// Enumerate installed fonts for Appearance → Typography pickers.
// Uses `font-list` (macOS helper binary / Windows PowerShell / Linux fc-list).

import { getFonts, getFonts2, type IFontInfo } from "font-list";

export type SystemFontEntry = {
  /** CSS font-family name (unquoted). */
  family: string;
  /** True when OS reports the face as monospace (or name heuristic). */
  monospace: boolean;
};

let cache: SystemFontEntry[] | null = null;
let inflight: Promise<SystemFontEntry[]> | null = null;

/** Fallback when platform metadata misses mono — covers common Win/Linux names. */
const MONO_NAME_RE =
  /mono|consolas|courier|menlo|monaco|cascadia|fira code|jetbrains|source code|hack|iosevka|inconsolata|dejavu sans mono|liberation mono|nimbus mono|ubuntu mono|droid sans mono|anonymous pro|pt mono|sf mono|andale mono|lucida console|fixedsys|terminal/i;

function normalizeFamily(raw: string): string {
  return raw.replace(/^["']|["']$/g, "").trim();
}

function guessMonospace(family: string, reported: boolean): boolean {
  return reported || MONO_NAME_RE.test(family);
}

function dedupe(entries: SystemFontEntry[]): SystemFontEntry[] {
  const byFamily = new Map<string, SystemFontEntry>();
  for (const e of entries) {
    const key = e.family.toLowerCase();
    const prev = byFamily.get(key);
    if (!prev) {
      byFamily.set(key, e);
      continue;
    }
    // Prefer marking monospace if any face of the family is mono.
    if (e.monospace && !prev.monospace) {
      byFamily.set(key, { ...prev, monospace: true });
    }
  }
  return [...byFamily.values()].sort((a, b) =>
    a.family.localeCompare(b.family, undefined, { sensitivity: "base" }),
  );
}

async function loadSystemFonts(): Promise<SystemFontEntry[]> {
  try {
    const detailed: IFontInfo[] = await getFonts2({ disableQuoting: true });
    return dedupe(
      detailed
        .map((f) => {
          const family = normalizeFamily(f.familyName || f.name);
          return {
            family,
            monospace: guessMonospace(family, Boolean(f.monospace)),
          };
        })
        .filter((f) => f.family.length > 0),
    );
  } catch {
    // Fallback: family names only (no OS mono metadata).
    const names = await getFonts({ disableQuoting: true });
    return dedupe(
      names
        .map((n) => {
          const family = normalizeFamily(n);
          return {
            family,
            monospace: guessMonospace(family, false),
          };
        })
        .filter((f) => f.family.length > 0),
    );
  }
}

/** Cached system font list (process lifetime). */
export async function listSystemFonts(): Promise<SystemFontEntry[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = loadSystemFonts()
      .then((list) => {
        cache = list;
        inflight = null;
        return list;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}
