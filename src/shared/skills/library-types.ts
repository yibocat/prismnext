export type SkillLibrarySourceKind = "bundled" | "remote" | "github";

/** One browsable skill row in the Install skills library grid. */
export interface LibraryCatalogItem {
  key: string;
  skillId: string;
  name: string;
  description: string;
  sourceId: string;
  sourceLabel: string;
  sourceKind: SkillLibrarySourceKind;
  category?: "academic" | "general";
  /** Registry install metadata */
  registrySkillName?: string;
  artifactUrl?: string;
  artifactType?: "skill-md" | "archive" | "unknown";
  artifactFiles?: string[];
  indexUrl?: string;
  /** GitHub install metadata */
  githubPackageId?: string;
}

export interface SkillLibrarySourcePublic {
  id: string;
  kind: SkillLibrarySourceKind;
  url?: string;
  repo?: string;
  ref?: string;
  subPath?: string;
  connected: boolean;
  name: string;
  description: string;
  removable: boolean;
}
