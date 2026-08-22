export type ExpertPermissionPreset = "read-only" | "standard" | "full";

export const EXPERT_PERMISSION_PRESET_OPTIONS: Array<{
  value: ExpertPermissionPreset;
  label: string;
  description: string;
}> = [
  {
    value: "read-only",
    label: "Read-only",
    description: "Search and read — no edits or shell",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Read tools + ask before edit/bash",
  },
  {
    value: "full",
    label: "Full tools",
    description: "All tools allowed (still no subagent delegation)",
  },
];

export function permissionFromExpertPreset(
  preset: ExpertPermissionPreset,
): Record<string, unknown> {
  switch (preset) {
    case "read-only":
      return { edit: "deny", bash: "deny", task: { "*": "deny" } };
    case "standard":
      return { edit: "ask", bash: "ask", task: { "*": "deny" } };
    case "full":
      return { task: { "*": "deny" } };
  }
}

export function detectExpertPermissionPreset(
  permission?: Record<string, unknown>,
): ExpertPermissionPreset {
  if (!permission) return "standard";
  if (permission.edit === "deny" && permission.bash === "deny") return "read-only";
  if (permission.edit === "ask" || permission.bash === "ask") return "standard";
  return "full";
}
