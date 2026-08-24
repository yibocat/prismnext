export type SkillInstallAdapter = "github" | "discovery" | "direct-url" | "bundled";

export interface GitHubInstallOrigin {
  adapter: "github";
  repo: string;
  ref: string;
  path: string;
}

export interface DiscoveryInstallOrigin {
  adapter: "discovery";
  indexUrl: string;
}

export type SkillInstallOrigin = GitHubInstallOrigin | DiscoveryInstallOrigin;

export interface SkillPackageOption {
  id: string;
  name: string;
  description: string;
  path: string;
  hasRequirements: boolean;
  artifactUrl?: string;
  artifactType?: "skill-md" | "archive" | "unknown";
  artifactFiles?: string[];
  indexUrl?: string;
}

export interface SkillSharedBundleOption {
  id: string;
  label: string;
  path: string;
}

export interface SkillInstallRecord {
  skillId: string;
  origin: SkillInstallOrigin;
  installedAt: string;
  contentVersion?: string;
  /** sha256 hex of installed SKILL.md bytes */
  contentDigest?: string;
  /** Expected digest from discovery index at install time (`sha256:` stripped) */
  registryDigest?: string;
  /** Relative path within GitHub repo (e.g. skills/nature-reader) */
  packagePath?: string;
}

export type SkillUpdateStatus = "current" | "update_available" | "source_missing" | "unknown";

export interface SkillUpdateInfo {
  skillId: string;
  status: SkillUpdateStatus;
  updateAvailable: boolean;
  installedVersion?: string;
  remoteVersion?: string;
  message?: string;
}

export interface SkillSourceAnalysis {
  adapter: SkillInstallAdapter;
  label: string;
  cacheKey: string;
  origin: SkillInstallOrigin;
  packages: SkillPackageOption[];
  sharedBundle?: SkillSharedBundleOption;
  warnings: string[];
}

export interface SkillPackageInstallSelection {
  cacheKey: string;
  packageIds: string[];
  includeShared: boolean;
  origin: SkillInstallOrigin;
}
