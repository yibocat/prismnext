import { useMemo } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { isExternalFileId, resolveExternalPath } from "@/lib/files/external-file";

export function NoFileOpen() {
  const openExternalFile = useDocumentStore((s) => s.openExternalFile);
  const openFile = useRightPanelStore((s) => s.openFile);
  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const fileMetadata = useDocumentStore((s) => s.fileMetadata);
  const recentOpenedFiles = useSettingsStore((s) => s.settings.recentOpenedFiles);

  const recent = useMemo(() => {
    const entries = recentOpenedFiles ?? [];
    return entries
      .filter((e) => fileMetadata.has(e.id) || isExternalFileId(e.id))
      .slice(0, 8);
  }, [recentOpenedFiles, fileMetadata]);

  const handleOpenRecent = async (id: string, name: string) => {
    if (isExternalFileId(id)) {
      const abs = resolveExternalPath(id);
      if (abs) await openExternalFile(abs, { pin: true });
      return;
    }
    setActiveFile(id);
    openFile(id, id, name, { pin: true });
  };

  if (recent.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          No open files
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
      <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
        No open files
      </p>
      <div className="w-full max-w-xs space-y-1">
        <p className="text-[length:var(--font-hint)] text-muted-foreground text-center">
          Recent
        </p>
        {recent.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="w-full truncate rounded px-2 py-1 text-left text-[length:var(--font-size-12)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={entry.id}
            onClick={() => void handleOpenRecent(entry.id, entry.name)}
          >
            {entry.name}
          </button>
        ))}
      </div>
    </div>
  );
}
