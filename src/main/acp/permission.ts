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
): PermissionResponse {
  const preferredKinds = approved
    ? ["allow_once", "allow_always"]
    : ["reject_once", "reject_always"];

  const option = preferredKinds
    .map((kind) => options.find((candidate) => candidate.kind === kind))
    .find(Boolean);

  if (!option) {
    return { outcome: { outcome: "cancelled" } };
  }

  return { outcome: { outcome: "selected", optionId: option.optionId } };
}
