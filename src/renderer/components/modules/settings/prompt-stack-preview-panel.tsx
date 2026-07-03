import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  DOCUMENT_MARKDOWN_TYPOGRAPHY,
  MARKDOWN_COMPONENTS,
  prepareDocumentMarkdown,
} from "@/lib/markdown/markdown-config";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";

/** Short role label — clarifies injection timing, not duplicate of layer title. */
const SECTION_ROLE: Record<string, string> = {
  "prism-system": "OpenCode instructions",
  "agents-md": "OpenCode instructions",
  "project-rules": "Each chat turn",
  "orchestrator-agent": "Primary agent · Expert team",
};

type StackPreview = Awaited<ReturnType<typeof window.electronAPI.settingsGetPromptStackPreview>>;
type StackSection = StackPreview["sections"][number];

function SectionContentPreview({ content }: { content: string }) {
  const body = useMemo(() => prepareDocumentMarkdown(content, "default"), [content]);
  return (
    <div
      className={cn(
        DOCUMENT_MARKDOWN_TYPOGRAPHY,
        "text-[length:var(--font-size-12)]",
        "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[1.05em]",
        "[&_h3]:mt-2.5 [&_h3]:mb-1",
        "[&_p]:my-1.5",
        "[&_ul]:my-1.5",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

function StackSectionCard({
  section,
  index,
  expanded,
  onToggle,
}: {
  section: StackSection;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const empty = !section.content.trim();
  const role = SECTION_ROLE[section.id];

  return (
    <article className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(BADGE, "bg-primary/10 text-primary normal-case tracking-normal")}>
              Layer {index + 1}
            </span>
            {role ? (
              <span
                className={cn(
                  BADGE,
                  "bg-muted text-muted-foreground normal-case tracking-normal",
                )}
              >
                {role}
              </span>
            ) : null}
            <p className="text-[length:var(--font-size-13)] font-medium">{section.label}</p>
            <span className="text-[length:var(--font-size-11)] text-muted-foreground/70 tabular-nums">
              {section.charCount.toLocaleString()} chars
            </span>
          </div>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-snug">
            <span className="font-medium text-muted-foreground/90">Inject via: </span>
            {section.injectPath}
          </p>
          {section.fileHint ? (
            <p className="text-[length:var(--font-size-11)] font-mono text-muted-foreground/70 truncate">
              {section.fileHint}
            </p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border bg-muted/15 px-4 py-3">
          {empty ? (
            <p className="text-[length:var(--font-size-12)] text-muted-foreground italic">(empty)</p>
          ) : (
            <SectionContentPreview content={section.content} />
          )}
        </div>
      ) : null}
    </article>
  );
}

export function PromptStackPreviewPanel() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const agentSystemPrompt = useSettingsStore((s) => s.settings.agentSystemPrompt) ?? "";

  const [preview, setPreview] = useState<StackPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const loadPreview = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      try {
        const data = await window.electronAPI.settingsGetPromptStackPreview(
          projectRoot ?? undefined,
          agentSystemPrompt || undefined,
        );
        setPreview(data);
        setExpandedIds((prev) => {
          if (prev.size > 0) return prev;
          const first = data.sections[0]?.id;
          return first ? new Set([first]) : new Set();
        });
      } catch {
        toast.error("Failed to load prompt stack preview.");
        setPreview(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectRoot, agentSystemPrompt],
  );

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPreview({ silent: true });
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (!preview) return;
    setExpandedIds(new Set(preview.sections.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-[length:var(--font-size-13)] text-muted-foreground">
        Could not load prompt stack preview.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="ghost" size="xs" onClick={expandAll}>
            Expand all
          </Button>
          <Button variant="ghost" size="xs" onClick={collapseAll}>
            Collapse all
          </Button>
        </div>
        <span className="text-[length:var(--font-size-11)] text-muted-foreground tabular-nums">
          {preview.sections.length} layer{preview.sections.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className={SETTINGS_DETAIL_SHELL}>
          <div className="space-y-1">
            <p className={SETTINGS_ROW_DESC}>
              Each layer is injected separately — not one monolithic system prompt. Layer 4 (with a
              project open) is the default{" "}
              <span className="font-medium text-foreground/80">Orchestrator primary agent</span>{" "}
              definition (`agent.md`), not a merged assemble of layers 1–3. Scroll the panel to read
              expanded content.
            </p>
            {preview.orchestratorName && preview.orchestratorId ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                Default orchestrator:{" "}
                <span className="font-medium text-foreground/90">{preview.orchestratorName}</span>{" "}
                <code className="text-[length:var(--font-size-11)]">{preview.orchestratorId}</code>
              </p>
            ) : !projectRoot ? (
              <p className="text-[length:var(--font-size-12)] text-muted-foreground italic">
                Open a project to preview AGENTS.md, project rules, and orchestrator agent.md.
              </p>
            ) : null}
          </div>

          <section className="space-y-3">
            <h3 className={SETTINGS_CATEGORY_HEADER}>Injection layers</h3>
            {preview.sections.map((section, index) => (
              <StackSectionCard
                key={section.id}
                section={section}
                index={index}
                expanded={expandedIds.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
