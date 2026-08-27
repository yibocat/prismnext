import {
  firstExecutionTarget,
  parseRemoteAbs,
  RemoteOperationError,
  type ExecutionTarget,
} from "../../shared/remote";
import { projectLifecycleAuthority } from "../project/project-lifecycle-authority";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function executionTargetFromArgs(args: unknown, keys: string[]): ExecutionTarget | null {
  const rec = asRecord(args);
  if (!rec) return null;
  return firstExecutionTarget(...keys.map((key) => rec[key] as string | undefined));
}

export function remoteProfileFromArgs(args: unknown, keys: string[]): string | null {
  const target = executionTargetFromArgs(args, keys);
  return target?.kind === "remote" ? target.profileId : null;
}

export function remoteProfileFromCurrentRoot(): string | null {
  const root = projectLifecycleAuthority.currentRoot;
  return typeof root === "string" ? parseRemoteAbs(root)?.profileId ?? null : null;
}

export function rewriteRemoteAbsKeys(params: unknown, keys: string[]): Record<string, unknown> {
  const rec = asRecord(params) ?? {};
  const next = { ...rec };
  for (const key of keys) {
    const value = next[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) next[key] = parsed.abs;
  }
  return next;
}

export async function routeHostDomainMethod(
  method: string,
  args: unknown,
  opts: {
    keys: string[];
    useCurrentRoot?: boolean;
    disconnected?: (method: string) => { hit: true; result: unknown } | { hit: false };
    broker: {
      isBound(profileId: string): boolean;
      invoke(profileId: string, method: string, params: unknown): Promise<unknown>;
    };
  },
): Promise<unknown | undefined> {
  const profileId = remoteProfileFromArgs(args, opts.keys)
    ?? (opts.useCurrentRoot ? remoteProfileFromCurrentRoot() : null);
  if (!profileId) return undefined;
  if (!opts.broker.isBound(profileId)) {
    const probe = opts.disconnected?.(method);
    if (probe?.hit) return probe.result;
    throw new RemoteOperationError("not_connected", "Not connected.");
  }
  return opts.broker.invoke(profileId, method, rewriteRemoteAbsKeys(args, opts.keys));
}
