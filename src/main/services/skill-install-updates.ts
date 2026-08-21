import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GitHubInstallOrigin, SkillInstallRecord, SkillUpdateInfo } from "../../shared/skill-install-types";
import { parseSha256Digest, sha256Hex, verifySha256Digest } from "./skill-install-digest";
import { githubRawSkillMdUrl, parseSkillVersionFromMarkdown } from "./skill-install-github";
import { fetchRegistryIndex, fetchSkillMarkdown, skillNameToFolderId } from "./skills-registry";
import { readSkillsManifest } from "./skills-sync";
import { homeSkillDir } from "../workbench/home";

function readInstalledSkillDigest(_projectRoot: string, skillId: string): string | undefined {
  const skillMd = join(homeSkillDir(skillId), "SKILL.md");
  if (!existsSync(skillMd)) return undefined;
  return sha256Hex(readFileSync(skillMd, "utf-8"));
}

function githubPackagePathCandidates(record: SkillInstallRecord): string[] {
  const origin = record.origin as GitHubInstallOrigin;
  const base = origin.path?.replace(/\/$/, "") ?? "";
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (path: string) => {
    const normalized = path.replace(/^\.\/?/, "").replace(/\/$/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  if (record.packagePath) add(record.packagePath);
  if (base) add(`${base}/${record.skillId}`);
  add(`skills/${record.skillId}`);
  add(record.skillId);

  return candidates;
}

async function fetchGitHubRemoteSkillMd(record: SkillInstallRecord): Promise<string | null> {
  const origin = record.origin as GitHubInstallOrigin;
  for (const packagePath of githubPackagePathCandidates(record)) {
    const url = githubRawSkillMdUrl(origin.repo, origin.ref, packagePath);
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/markdown, text/plain, */*" },
      });
      if (response.ok) return response.text();
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function checkGitHubUpdate(
  projectRoot: string,
  record: SkillInstallRecord,
): Promise<SkillUpdateInfo> {
  const remoteMd = await fetchGitHubRemoteSkillMd(record);
  if (!remoteMd) {
    return {
      skillId: record.skillId,
      status: "source_missing",
      updateAvailable: false,
      installedVersion: record.contentVersion,
      message: "Skill no longer found at the recorded GitHub source.",
    };
  }

  const remoteDigest = sha256Hex(remoteMd);
  const installedDigest = record.contentDigest ?? readInstalledSkillDigest(projectRoot, record.skillId);
  const remoteVersion = parseSkillVersionFromMarkdown(remoteMd);

  if (installedDigest && remoteDigest !== installedDigest) {
    return {
      skillId: record.skillId,
      status: "update_available",
      updateAvailable: true,
      installedVersion: record.contentVersion,
      remoteVersion,
      message: "Remote SKILL.md differs from the installed copy.",
    };
  }

  if (
    record.contentVersion &&
    remoteVersion &&
    remoteVersion !== record.contentVersion
  ) {
    return {
      skillId: record.skillId,
      status: "update_available",
      updateAvailable: true,
      installedVersion: record.contentVersion,
      remoteVersion,
      message: `Version ${record.contentVersion} → ${remoteVersion}`,
    };
  }

  return {
    skillId: record.skillId,
    status: installedDigest ? "current" : "unknown",
    updateAvailable: false,
    installedVersion: record.contentVersion,
    remoteVersion,
    message: installedDigest ? undefined : "No install digest recorded — reinstall to enable update checks.",
  };
}

async function checkDiscoveryUpdate(
  projectRoot: string,
  record: SkillInstallRecord,
): Promise<SkillUpdateInfo> {
  const origin = record.origin;
  if (origin.adapter !== "discovery") {
    throw new Error("Expected discovery install record.");
  }

  let index;
  try {
    index = await fetchRegistryIndex(origin.indexUrl);
  } catch (err) {
    return {
      skillId: record.skillId,
      status: "source_missing",
      updateAvailable: false,
      installedVersion: record.contentVersion,
      message: err instanceof Error ? err.message : "Registry unavailable.",
    };
  }

  const entry = index.skills.find((skill) => skillNameToFolderId(skill.name) === record.skillId);
  if (!entry) {
    return {
      skillId: record.skillId,
      status: "source_missing",
      updateAvailable: false,
      installedVersion: record.contentVersion,
      message: "Skill is no longer listed in the registry index.",
    };
  }

  const remoteRegistryDigest = parseSha256Digest(entry.digest);
  if (
    record.registryDigest &&
    remoteRegistryDigest &&
    remoteRegistryDigest !== record.registryDigest
  ) {
    return {
      skillId: record.skillId,
      status: "update_available",
      updateAvailable: true,
      installedVersion: record.contentVersion,
      message: "Registry index digest changed since install.",
    };
  }

  try {
    const remoteMd = await fetchSkillMarkdown(entry.url);
    const remoteDigest = sha256Hex(remoteMd);
    const installedDigest = record.contentDigest ?? readInstalledSkillDigest(projectRoot, record.skillId);
    const remoteVersion = parseSkillVersionFromMarkdown(remoteMd);

    if (entry.digest) {
      try {
        verifySha256Digest(remoteMd, entry.digest);
      } catch {
        return {
          skillId: record.skillId,
          status: "update_available",
          updateAvailable: true,
          installedVersion: record.contentVersion,
          remoteVersion,
          message: "Remote skill content no longer matches the registry digest.",
        };
      }
    }

    if (installedDigest && remoteDigest !== installedDigest) {
      return {
        skillId: record.skillId,
        status: "update_available",
        updateAvailable: true,
        installedVersion: record.contentVersion,
        remoteVersion,
        message: "Remote SKILL.md differs from the installed copy.",
      };
    }

    if (
      record.contentVersion &&
      remoteVersion &&
      remoteVersion !== record.contentVersion
    ) {
      return {
        skillId: record.skillId,
        status: "update_available",
        updateAvailable: true,
        installedVersion: record.contentVersion,
        remoteVersion,
        message: `Version ${record.contentVersion} → ${remoteVersion}`,
      };
    }

    return {
      skillId: record.skillId,
      status: installedDigest ? "current" : "unknown",
      updateAvailable: false,
      installedVersion: record.contentVersion,
      remoteVersion,
    };
  } catch (err) {
    return {
      skillId: record.skillId,
      status: "unknown",
      updateAvailable: false,
      installedVersion: record.contentVersion,
      message: err instanceof Error ? err.message : "Could not fetch remote skill content.",
    };
  }
}

export async function checkSkillUpdate(
  projectRoot: string,
  skillId: string,
): Promise<SkillUpdateInfo | null> {
  const manifest = readSkillsManifest(projectRoot);
  const record = (manifest.installs ?? []).find((item) => item.skillId === skillId);
  if (!record) return null;

  if (record.origin.adapter === "github") {
    return checkGitHubUpdate(projectRoot, record);
  }
  if (record.origin.adapter === "discovery") {
    return checkDiscoveryUpdate(projectRoot, record);
  }

  return {
    skillId,
    status: "unknown",
    updateAvailable: false,
    message: "Update checks are not supported for this install source.",
  };
}

export async function checkSkillUpdates(projectRoot: string): Promise<SkillUpdateInfo[]> {
  const manifest = readSkillsManifest(projectRoot);
  const records = manifest.installs ?? [];
  const results: SkillUpdateInfo[] = [];

  for (const record of records) {
    if (record.origin.adapter === "github") {
      results.push(await checkGitHubUpdate(projectRoot, record));
    } else if (record.origin.adapter === "discovery") {
      results.push(await checkDiscoveryUpdate(projectRoot, record));
    }
  }

  return results;
}
