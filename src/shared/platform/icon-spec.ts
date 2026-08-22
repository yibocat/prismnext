/**
 * Unified icon spec for teams and projects — three optional forms the user can pick.
 * Stored as a small object in team.json / `.workbench/settings.json`.
 *
 * - emoji:  a single glyph string ("🧊")
 * - lucide: a PascalCase lucide icon name ("Beaker")
 * - image:  a relative filename under the team dir / `.prismnext/` ("icon.png")
 *
 * Image bytes live on disk next to the manifest — never inline Base64 in JSON.
 *
 * Backward compat: a bare string (legacy `projectIcon`) is read as an emoji.
 * A legacy `image` with a `data:` URL is rejected by normalize (re-pick to migrate).
 */
export type IconKind = "emoji" | "lucide" | "image";

export type IconSpec =
  | { kind: "emoji"; value: string }
  | { kind: "lucide"; value: string }
  | { kind: "image"; value: string };

/** Canonical on-disk filename for team / project image icons. */
export const ICON_IMAGE_FILENAME = "icon.png";

/** Normalize arbitrary stored data into an IconSpec, or null when absent/invalid. */
export function normalizeIconSpec(input: unknown): IconSpec | null {
  if (input == null) return null;
  if (typeof input === "string") {
    const value = input.trim();
    if (!value) return null;
    // Legacy `projectIcon` was always an emoji glyph; team `icon` was never
    // written. Treat bare strings as emoji so existing projects keep rendering.
    if (value.length <= 16) return { kind: "emoji", value };
    return null;
  }
  if (typeof input !== "object") return null;
  const raw = input as { kind?: unknown; value?: unknown };
  const kind = raw.kind;
  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  if (!value) return null;
  if (kind === "emoji" || kind === "lucide") {
    return { kind, value };
  }
  if (kind === "image") {
    // Reject legacy inline data URLs — image icons must be relative filenames.
    if (value.startsWith("data:") || value.includes("/") || value.includes("\\") || value.includes("..")) {
      return null;
    }
    return { kind: "image", value };
  }
  return null;
}

/** Structural equality for IconSpec (used to skip no-op writes). */
export function iconSpecEquals(
  a: IconSpec | null | undefined,
  b: IconSpec | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.value === b.value;
}

/** Serialize for JSON storage. Returns null when there is nothing to store. */
export function iconSpecToJSON(spec: IconSpec | null): IconSpec | null {
  return spec ? { ...spec } : null;
}
