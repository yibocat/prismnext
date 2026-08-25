import { isRemoteProjectRoot } from "../../shared/remote";

export function remoteAgentBlocked(input: {
  projectRoot?: string | null;
  boundCheckoutPath?: string | null;
}): boolean {
  return isRemoteProjectRoot(input.projectRoot ?? "")
    || isRemoteProjectRoot(input.boundCheckoutPath ?? "");
}
