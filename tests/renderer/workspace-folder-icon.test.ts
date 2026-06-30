import { describe, expect, it } from "vitest";
import {
  defaultFolderIcon,
  normalizeStoredFolderIcon,
  resolveFolderIconName,
} from "@/lib/workspace/folder-icons";
import type { NotebookFolder } from "@/types/workspace";

describe("resolveFolderIconName", () => {
  it("uses type default when icon unset", () => {
    const folder: NotebookFolder = { function: "notebook", name: "notes" };
    expect(resolveFolderIconName(folder)).toBe(defaultFolderIcon("notebook"));
  });

  it("uses custom lucide icon when configured", () => {
    const folder: NotebookFolder = { function: "notebook", name: "notes", icon: "Bookmark" };
    expect(resolveFolderIconName(folder)).toBe("Bookmark");
  });

  it("ignores legacy emoji values", () => {
    expect(normalizeStoredFolderIcon("📓")).toBeNull();
    const folder: NotebookFolder = { function: "notebook", name: "notes", icon: "📓" };
    expect(resolveFolderIconName(folder)).toBe(defaultFolderIcon("notebook"));
  });
});
