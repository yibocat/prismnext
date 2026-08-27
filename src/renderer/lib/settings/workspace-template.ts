import {
  createDefaultFolder,
  defaultWorkspaceDirs,
  type FolderFunction,
  type WorkspaceFolder,
} from "@/types/workspace";

function isCaseInsensitiveFs(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator.platform.startsWith("Mac") || navigator.platform.startsWith("Win"))
  );
}

function isDuplicateName(dirs: WorkspaceFolder[], name: string, skipIndex?: number): boolean {
  const ci = isCaseInsensitiveFs();
  return dirs.some((d, i) => {
    if (skipIndex !== undefined && i === skipIndex) return false;
    return ci ? d.name.toLowerCase() === name.toLowerCase() : d.name === name;
  });
}

export function validateFolderName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Folder name cannot be empty.";
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return `Folder name "${trimmed}" cannot contain path separators.`;
  }
  if (trimmed === "." || trimmed === "..") return `Folder name "${trimmed}" is reserved.`;
  return null;
}

export function validateNewTemplateFolder(
  dirs: WorkspaceFolder[],
  func: FolderFunction,
  name: string,
): string | null {
  const nameErr = validateFolderName(name);
  if (nameErr) return nameErr;
  if (isDuplicateName(dirs, name.trim())) {
    return `A folder named "${name.trim()}" already exists.`;
  }
  if (func === "manuscript" && dirs.some((d) => d.function === "manuscript")) {
    return "Only one manuscript folder is allowed.";
  }
  return null;
}

export function validateTemplateFolderPatch(
  dirs: WorkspaceFolder[],
  index: number,
  patch: Partial<WorkspaceFolder>,
): string | null {
  const current = dirs[index];
  if (!current) return "Folder not found.";

  if (patch.name !== undefined) {
    const nameErr = validateFolderName(patch.name);
    if (nameErr) return nameErr;
    if (isDuplicateName(dirs, patch.name.trim(), index)) {
      return `A folder named "${patch.name.trim()}" already exists.`;
    }
  }

  if (
    patch.function === "manuscript" &&
    current.function !== "manuscript" &&
    dirs.some((d, i) => i !== index && d.function === "manuscript")
  ) {
    return "Only one manuscript folder is allowed.";
  }

  return null;
}

export function applyTemplateFolderPatch(
  dirs: WorkspaceFolder[],
  index: number,
  patch: Partial<WorkspaceFolder>,
): WorkspaceFolder[] {
  const current = dirs[index];
  if (!current) return dirs;

  let updated: WorkspaceFolder;
  if (patch.function && patch.function !== current.function) {
    updated = createDefaultFolder((patch.name ?? current.name).trim(), patch.function);
    if (patch.description !== undefined) {
      updated = { ...updated, description: patch.description || undefined };
    } else if (current.description) {
      updated = { ...updated, description: current.description };
    }
  } else {
    updated = { ...current, ...patch } as WorkspaceFolder;
    if (patch.name !== undefined) updated = { ...updated, name: patch.name.trim() };
    if (patch.description !== undefined) {
      updated = { ...updated, description: patch.description || undefined };
    }
  }

  return dirs.map((d, i) => (i === index ? updated : d));
}

export function appDefaultWorkspaceTemplate(): WorkspaceFolder[] {
  return defaultWorkspaceDirs();
}
