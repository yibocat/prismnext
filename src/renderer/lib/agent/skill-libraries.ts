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
  name: "Prism Curated",
  description: "Skills bundled with the app — install copies into your project",
  kind: "bundled",
};

/** Preset remote registries (optional connect targets in sources dialog). */
export const SKILL_LIBRARY_PRESETS: SkillLibraryCard[] = [
  PRISM_CURATED_LIBRARY,
  {
    id: "agentskills",
    name: "agentskills.io",
    description: "Example registry (spec site) — lists only skills published by that domain",
    kind: "remote",
    registryUrl: "https://agentskills.io/.well-known/agent-skills/index.json",
    homepage: "https://agentskills.io",
  },
  {
    id: "specification-website",
    name: "specification.website",
    description: "Example registry — one skill published by specification.website",
    kind: "remote",
    registryUrl: "https://specification.website/.well-known/agent-skills/index.json",
    homepage: "https://specification.website",
  },
];

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
