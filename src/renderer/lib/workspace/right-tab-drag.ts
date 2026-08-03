import type { ComposerDragPayload } from "@/lib/chat/composer-drag";
import { projectPathBasename } from "@/lib/files/mentionable-files";
import { linkLabelForUrl } from "@/lib/browser-link/normalize";
import { useLiteratureStore } from "@/stores/literature-store";
import { tabDisplayTitle } from "@/lib/workspace/tab-lifecycle";
import type { RightTab } from "@/lib/workspace/mode-registry";

/** Map a RightArea tab to a composer inline payload (null = not draggable to chat). */
export function rightTabComposerDragPayload(tab: RightTab): ComposerDragPayload | null {
  switch (tab.kind) {
    case "browser": {
      const url = tab.url?.trim();
      if (!url) return null;
      const title = tab.title?.trim();
      return {
        v: 1,
        kind: "link",
        url,
        label: title && title !== "New Tab" ? title : linkLabelForUrl(url),
      };
    }
    case "file":
    case "texworkspace":
    case "research-plan": {
      const filePath = tab.filePath?.trim();
      const fileId = tab.fileId?.trim();
      if (!filePath || !fileId || tab.isInitial) return null;
      return {
        v: 1,
        kind: "file-mention",
        filePath,
        fileId,
        label: projectPathBasename(filePath),
      };
    }
    case "literature": {
      const paperId = tab.literaturePaperId?.trim();
      if (!paperId) return null;
      const paper = useLiteratureStore.getState().papers.find((p) => p.id === paperId);
      if (!paper) return null;
      const bibkey = paper.bibkey?.trim() || paper.id;
      return {
        v: 1,
        kind: "paper-mention",
        paperId,
        bibkey,
        title: paper.title,
        label: bibkey,
      };
    }
    default:
      return null;
  }
}

export function rightTabComposerDragLabel(tab: RightTab): string {
  const payload = rightTabComposerDragPayload(tab);
  if (payload) {
    if (payload.kind === "link") return payload.label ?? payload.url;
    if (payload.kind === "file-mention") return payload.label;
    if (payload.kind === "paper-mention") return payload.label ?? payload.bibkey;
  }
  return tabDisplayTitle(tab);
}
