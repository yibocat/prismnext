import { sshConfigHostToProfile, type SshProfile } from "../../shared/remote";
import { applyProfileOverrides } from "./profile-overrides";
import { findSshConfigHost, loadUserSshConfigHosts } from "./ssh-config";

export function listSshProfiles(): SshProfile[] {
  return loadUserSshConfigHosts().map((host) => applyProfileOverrides(sshConfigHostToProfile(host)));
}

export function getSshProfile(id: string): SshProfile | null {
  const host = findSshConfigHost(id);
  return host ? applyProfileOverrides(sshConfigHostToProfile(host)) : null;
}
