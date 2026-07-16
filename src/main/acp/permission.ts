type PermissionOption = {
  optionId: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
  name?: string;
};

export type PermissionResponse =
  | { outcome: { outcome: "selected"; optionId: string } }
  | { outcome: { outcome: "cancelled" } };

export function buildPermissionOutcome(
  options: PermissionOption[],
  approved: boolean,
  opts?: { preferAlways?: boolean },
): PermissionResponse {
  const preferredKinds = approved
    ? opts?.preferAlways
      ? ["allow_always", "allow_once"]
      : ["allow_once", "allow_always"]
    : ["reject_once", "reject_always"];

  const option = preferredKinds
    .map((kind) => options.find((candidate) => candidate.kind === kind))
    .find(Boolean);

  if (!option) {
    // Some OpenCode builds omit options — still resolve allow/deny for ACP.
    if (options.length === 0) {
      return {
        outcome: {
          outcome: "selected",
          optionId: approved ? "allow_once" : "reject_once",
        },
      };
    }
    return { outcome: { outcome: "cancelled" } };
  }

  return { outcome: { outcome: "selected", optionId: option.optionId } };
}
