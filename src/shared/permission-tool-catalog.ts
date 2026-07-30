/**
 * OpenCode tool names that Allow/Deny rules meaningfully apply to.
 *
 * Omitted (always allowed by smart policy — no confirmation, rules not needed):
 * read, grep, glob, question, task, skill, todowrite, …
 */
export type PermissionGatedToolGroupId = "file" | "shell" | "network";

export type PermissionGatedToolCatalogEntry = {
  name: string;
  group: PermissionGatedToolGroupId;
};

export const PERMISSION_GATED_TOOL_CATALOG: PermissionGatedToolCatalogEntry[] = [
  { name: "edit", group: "file" },
  { name: "write", group: "file" },
  { name: "apply_patch", group: "file" },
  { name: "delete", group: "file" },
  { name: "move", group: "file" },
  { name: "bash", group: "shell" },
  { name: "webfetch", group: "network" },
  { name: "websearch", group: "network" },
];

const GROUP_ORDER: PermissionGatedToolGroupId[] = ["file", "shell", "network"];

export function permissionGatedToolsByGroup(): Array<{
  group: PermissionGatedToolGroupId;
  tools: string[];
}> {
  const buckets = new Map<PermissionGatedToolGroupId, string[]>();
  for (const entry of PERMISSION_GATED_TOOL_CATALOG) {
    const list = buckets.get(entry.group) ?? [];
    list.push(entry.name);
    buckets.set(entry.group, list);
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((group) => ({
    group,
    tools: buckets.get(group)!,
  }));
}
