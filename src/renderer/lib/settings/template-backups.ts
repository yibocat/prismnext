import { templateDesktop } from "@/lib/desktop-api/template";

export type TemplateBackupEntry = Awaited<
  ReturnType<typeof templateDesktop.templateListBackups>
>[number];

export async function listTemplateBackups(
  projectRoot: string,
): Promise<TemplateBackupEntry[]> {
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
  await templateDesktop.templateDeleteBackup({
    rootPath: projectRoot,
    backupLabel,
  });
}
