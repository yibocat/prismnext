import { templateDesktop } from "@/lib/desktop-api/template";
import { isRemoteProjectRoot } from "@shared/remote";

export type TemplateBackupEntry = Awaited<
  ReturnType<typeof templateDesktop.templateListBackups>
>[number];

export async function listTemplateBackups(
  projectRoot: string,
): Promise<TemplateBackupEntry[]> {
  if (isRemoteProjectRoot(projectRoot)) return [];
  try {
    return await templateDesktop.templateListBackups({ rootPath: projectRoot });
  } catch {
    return [];
  }
}

export async function restoreTemplateBackup(args: {
  projectRoot: string;
  manuscriptDir: string;
  backupLabel: string;
}): Promise<void> {
  if (isRemoteProjectRoot(args.projectRoot)) {
    throw new Error("Manuscript template backups are stored on this computer only.");
  }
  await templateDesktop.templateRestoreBackup({
    rootPath: args.projectRoot,
    manuscriptDir: args.manuscriptDir,
    backupLabel: args.backupLabel,
  });
}

export async function deleteTemplateBackup(
  projectRoot: string,
  backupLabel: string,
): Promise<void> {
  if (isRemoteProjectRoot(projectRoot)) {
    throw new Error("Manuscript template backups are stored on this computer only.");
  }
  await templateDesktop.templateDeleteBackup({
    rootPath: projectRoot,
    backupLabel,
  });
}
