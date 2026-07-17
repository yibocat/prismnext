import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WorkspaceSplit } from "@/components/layout/workspace-split";
import { RightPane } from "@/components/layout/right-pane";
import { PdfPreview } from "@/components/modules/preview";
import { CompileProblemsPanel } from "@/modes/texworkspace-mode/compile-problems-panel";
import { useLayoutStore, type TexworkspaceViewMode } from "@/stores/layout-store";
import type { RightTab } from "@/lib/workspace/mode-registry";

interface TexWorkspaceMainProps {
  tabs: RightTab[];
  activeTabId: string | null;
}

/** Which panel collapses for a view mode (slots stay left→right; swap only moves content). */
export function resolveTexworkspaceSplitCollapse(
  viewMode: TexworkspaceViewMode,
  panesSwapped: boolean,
): { leftCollapsed: boolean; rightCollapsed: boolean } {
  const hidePdf = viewMode === "tex";
  const hideEditor = viewMode === "pdf";
  return {
    leftCollapsed: panesSwapped ? hideEditor : hidePdf,
    rightCollapsed: panesSwapped ? hidePdf : hideEditor,
  };
}

/** Sash drag → view mode when a panel collapses. */
export function viewModeAfterPanelCollapse(
  side: "left" | "right",
  panesSwapped: boolean,
): TexworkspaceViewMode {
  if (side === "left") return panesSwapped ? "pdf" : "tex";
  return panesSwapped ? "tex" : "pdf";
}

function createContentHost(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.height = "100%";
  el.style.minHeight = "0";
  el.style.minWidth = "0";
  el.style.overflow = "hidden";
  return el;
}

/**
 * TeX workspace: PDF + Editor stay mounted for the lifetime of this view.
 *
 * Why position was lost: `viewMode === "tex" ? editor : …` unmounted the PDF
 * (and swap remounted both). Lector/CodeMirror state died with the tree.
 *
 * Fix: fixed left/right panel slots; portal content into stable hosts; swap only
 * reparents hosts; view modes only collapse a slot (children stay mounted).
 */
export function TexWorkspaceMain({ tabs, activeTabId }: TexWorkspaceMainProps) {
  const viewMode = useLayoutStore((s) => s.texworkspaceViewMode);
  const setViewMode = useLayoutStore((s) => s.setTexworkspaceViewMode);
  const panesSwapped = useLayoutStore((s) => s.texworkspacePanesSwapped);
  const problemsOpen = useLayoutStore((s) => s.texworkspaceProblemsOpen);

  const texTabs = useMemo(
    () => tabs.filter((t) => t.kind === "texworkspace"),
    [tabs],
  );

  const { leftCollapsed, rightCollapsed } = resolveTexworkspaceSplitCollapse(
    viewMode,
    panesSwapped,
  );

  const pdfHost = useMemo(() => createContentHost(), []);
  const editorHost = useMemo(() => createContentHost(), []);
  const leftSlotRef = useRef<HTMLDivElement>(null);
  const rightSlotRef = useRef<HTMLDivElement>(null);
  const [hostsAttached, setHostsAttached] = useState(false);

  useEffect(() => {
    return () => {
      pdfHost.remove();
      editorHost.remove();
    };
  }, [pdfHost, editorHost]);

  useLayoutEffect(() => {
    const left = leftSlotRef.current;
    const right = rightSlotRef.current;
    if (!left || !right) return;
    if (panesSwapped) {
      left.appendChild(editorHost);
      right.appendChild(pdfHost);
    } else {
      left.appendChild(pdfHost);
      right.appendChild(editorHost);
    }
    setHostsAttached(true);
  }, [panesSwapped, pdfHost, editorHost]);

  return (
    <>
      <WorkspaceSplit
        left={<div ref={leftSlotRef} className="h-full min-h-0 min-w-0 overflow-hidden" />}
        right={<div ref={rightSlotRef} className="h-full min-h-0 min-w-0 overflow-hidden" />}
        leftId="pdf"
        rightId="editor"
        defaultLeft={60}
        layoutKey="pdf:editor"
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onLeftCollapsedChange={(collapsed) => {
          if (collapsed) setViewMode(viewModeAfterPanelCollapse("left", panesSwapped));
          else setViewMode("split");
        }}
        onRightCollapsedChange={(collapsed) => {
          if (collapsed) setViewMode(viewModeAfterPanelCollapse("right", panesSwapped));
          else setViewMode("split");
        }}
      />
      {hostsAttached
        ? createPortal(
            <div className="relative h-full min-h-0 min-w-0">
              {/* Keep PdfPreview mounted when problems panel is open */}
              <div
                className={
                  problemsOpen
                    ? "pointer-events-none invisible absolute inset-0"
                    : "h-full min-h-0"
                }
              >
                <PdfPreview sourceMode="compile" />
              </div>
              {problemsOpen ? <CompileProblemsPanel /> : null}
            </div>,
            pdfHost,
          )
        : null}
      {hostsAttached
        ? createPortal(
            <RightPane tabs={texTabs} activeTabId={activeTabId} />,
            editorHost,
          )
        : null}
    </>
  );
}
