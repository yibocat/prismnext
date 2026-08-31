import { encodeRemoteAbs, parseRemoteAbs } from "./path";

export type LocalExecutionTarget = { kind: "local"; root: string };

export type RemoteExecutionTarget = {
  kind: "remote";
  profileId: string;
  abs: string;
  encoded: string;
};

export type ExecutionTarget = LocalExecutionTarget | RemoteExecutionTarget;

export function executionTargetFromPath(
  value: string | null | undefined,
): ExecutionTarget | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = parseRemoteAbs(value);
  if (!parsed) return { kind: "local", root: value };
  const encoded = encodeRemoteAbs(parsed.profileId, parsed.abs);
  if (!encoded) return null;
  return { kind: "remote", profileId: parsed.profileId, abs: parsed.abs, encoded };
}

export function firstExecutionTarget(
  ...values: Array<string | null | undefined>
): ExecutionTarget | null {
  for (const value of values) {
    const target = executionTargetFromPath(value);
    if (target) return target;
  }
  return null;
}
