import { useDocumentStore } from "@/stores/document-store";
import { useTabContext } from "@/lib/workspace/tab-context";

export function ImageViewer() {
  const { tab } = useTabContext();
  const fileId = tab.fileId;
  const dataUrl = useDocumentStore((s) => (fileId ? s.openedContents.get(fileId)?.dataUrl : undefined));

  if (!dataUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-[length:var(--font-placeholder)]">Image cannot be displayed</p>
        <p className="text-[length:var(--font-placeholder)] opacity-50">File too large or unsupported format</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)_50%/16px_16px] p-4">
      <img
        src={dataUrl}
        alt={tab.title ?? ""}
        className="max-h-full max-w-full object-contain rounded shadow-lg"
      />
    </div>
  );
}
