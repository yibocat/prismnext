import { sshConfigHostToProfile, type SshProfile } from "../../shared/remote";
import { findSshConfigHost, loadUserSshConfigHosts } from "./ssh-config";

export function listSshProfiles(): SshProfile[] {
  return loadUserSshConfigHosts().map(sshConfigHostToProfile);
}

export function getSshProfile(id: string): SshProfile | null {
  const host = findSshConfigHost(id);
  return host ? sshConfigHostToProfile(host) : null;
}
