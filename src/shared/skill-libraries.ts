export type SkillLibraryKind = "bundled" | "remote";

export interface SkillLibraryCard {
  id: string;
  name: string;
  description: string;
  kind: SkillLibraryKind;
  /** Resolved index.json URL for remote libraries. */
  registryUrl?: string;
  homepage?: string;
}

export const PRISM_CURATED_LIBRARY: SkillLibraryCard = {
  id: "prism-curated",
  name: "prismnext Curated",
  description: "Skills bundled with the app — install copies into your project",
  kind: "bundled",
};

/** GitHub repo presets for Install from URL. */
export const GITHUB_SKILL_PRESETS = [
  {
    id: "nature-skills",
    name: "nature-skills",
    description: "Community research skills — 15 nature-* packages + shared files",
    repoUrl: "https://github.com/Yuan1z0825/nature-skills",
  },
] as const;

/** Preset remote registries (publisher discovery indexes). */
export const SKILL_LIBRARY_PRESETS: SkillLibraryCard[] = [
  PRISM_CURATED_LIBRARY,
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    description: "11 official Cloudflare agent skills (Workers, wrangler, DO, …)",
    kind: "remote",
    registryUrl: "https://developers.cloudflare.com/.well-known/agent-skills/index.json",
    homepage: "https://developers.cloudflare.com",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Supabase + Postgres best-practices skill archives",
    kind: "remote",
    registryUrl: "https://supabase.com/.well-known/agent-skills/index.json",
    homepage: "https://supabase.com",
  },
];

/** Remote-only presets for quick-add in Browse library. */
export const REMOTE_SKILL_LIBRARY_PRESETS = SKILL_LIBRARY_PRESETS.filter(
  (card) => card.kind === "remote" && card.registryUrl,
);

/** @deprecated use SKILL_LIBRARY_PRESETS */
export const SKILL_LIBRARY_CARDS = SKILL_LIBRARY_PRESETS;

export function findLibraryCardByRegistryUrl(registryUrl: string): SkillLibraryCard | undefined {
  const normalized = registryUrl.trim().replace(/\/+$/, "");
  return SKILL_LIBRARY_PRESETS.find((card) => {
    if (!card.registryUrl) return false;
    return (
      card.registryUrl === registryUrl ||
      card.registryUrl.replace(/\/+$/, "") === normalized
    );
  });
}

export function libraryCardForRegistryUrl(registryUrl: string): SkillLibraryCard {
  const known = findLibraryCardByRegistryUrl(registryUrl);
  if (known) return known;
  let hostname = registryUrl;
  try {
    hostname = new URL(registryUrl).hostname;
  } catch {
    /* keep raw */
  }
  return {
    id: `custom:${registryUrl}`,
    name: hostname,
    description: "Custom skill registry",
    kind: "remote",
    registryUrl,
  };
}
