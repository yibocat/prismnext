import { settingsDesktop } from "@/lib/desktop-api/settings";

export type KnowledgeModuleInfo = Awaited<
  ReturnType<typeof settingsDesktop.settingsGetKnowledgeModules>
>[number];

/** Load knowledge modules for Settings → Knowledge panel. */
export async function fetchKnowledgeModules(
  projectRoot: string | null | undefined,
): Promise<KnowledgeModuleInfo[]> {
  try {
    return await settingsDesktop.settingsGetKnowledgeModules(projectRoot ?? undefined);
  } catch {
    return [];
  }
}
