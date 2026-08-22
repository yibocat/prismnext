import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpIcon, CheckIcon, CopyIcon, FileIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
  isComposerEmpty,
  partsToPlainText,
  type ComposerPart,
} from "@/lib/chat/composer-parts";
import {
  pickComposerAttachments,
  projectFileToAttachment,
  type ComposerAttachment,
} from "@/lib/chat/composer-attach-file";
import { useMentionableFiles } from "@/lib/files/mentionable-files";
import {
  loadSlashCatalog,
  type SlashCatalogMcp,
  type SlashCatalogSkill,
} from "@/lib/chat/slash-catalog";
import { listProjectSubagents } from "@/lib/settings";
import {
  extractUserMessageEditParts,
  resendFromUserTurn,
} from "@/lib/chat/user-message-resend";
import { ChatImagePreviewDialog } from "@/lib/markdown/chat-image-preview";
import type { SubagentInfo } from "@shared/agent/subagents";
import { ComposerToolbar } from "./agent-settings/composer-toolbar";
import { InlineComposerEditor } from "./inline-composer";
import { InlineRichText, InlineTokenChip } from "./inline-tokens";
import { COMPOSER_TOOLBAR_ICON_BUTTON } from "./worktree-selector";
import type { ContentBlock } from "@/stores/chat-store";
import { useChatStore } from "@/stores/chat-store";
import { useCommandStore } from "@/stores/command-store";
import { useDocumentStore } from "@/stores/document-store";

function contentBlocks(content: ContentBlock[] | undefined): ContentBlock[] {
  return Array.isArray(content) ? content : [];
}

const CopyButton = memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
      aria-label="Copy"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
});
CopyButton.displayName = "CopyButton";

export const UserMessageHeader = memo(function UserMessageHeader({
  blocks,
  turnIndex,
  attachedBelow,
}: {
  blocks: ContentBlock[];
  turnIndex: number;
  attachedBelow?: ReactNode;
}) {
  const { t } = useTranslation();
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const searchCommands = useCommandStore((s) => s.searchCommands);
  const files = useDocumentStore((s) => s.files);
  const fileMetadata = useDocumentStore((s) => s.fileMetadata);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const allBlocks = contentBlocks(blocks);
  const commandBlocks = allBlocks.filter((b) => b.type === "command");
  const profileBlocks = allBlocks.filter((b) => b.type === "profile");

  const initial = useMemo(() => extractUserMessageEditParts(allBlocks), [allBlocks]);
  const hasInlineParts = useMemo(
    () =>
      allBlocks.some((b) => b.type === "text" && Boolean(b.inlineParts?.length)),
    [allBlocks],
  );

  const text = partsToPlainText(initial.parts);

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editParts, setEditParts] = useState<ComposerPart[]>(initial.parts);
  const [editAttachments, setEditAttachments] = useState<ComposerAttachment[]>(
    initial.attachments,
  );
  const [sending, setSending] = useState(false);
  const [experts, setExperts] = useState<SubagentInfo[]>([]);
  const [slashSkills, setSlashSkills] = useState<SlashCatalogSkill[]>([]);
  const [slashMcps, setSlashMcps] = useState<SlashCatalogMcp[]>([]);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const long = text.length > 140;
  const hasBody = Boolean(text.trim()) || hasInlineParts || initial.attachments.length > 0;
  const mentionableFiles = useMentionableFiles(files, fileMetadata);

  useEffect(() => {
    if (!editing || !projectRoot) return;
    let cancelled = false;
    void (async () => {
      try {
        const [expertList, catalog] = await Promise.all([
          listProjectSubagents(projectRoot),
          loadSlashCatalog(projectRoot),
        ]);
        if (cancelled) return;
        setExperts(expertList ?? []);
        setSlashSkills(catalog.skills);
        setSlashMcps(catalog.mcps);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, projectRoot]);

  const beginEdit = useCallback(() => {
    if (isStreaming || sending) return;
    const next = extractUserMessageEditParts(allBlocks);
    setEditParts(next.parts);
    setEditAttachments(next.attachments);
    setExpanded(true);
    setEditing(true);
  }, [allBlocks, isStreaming, sending]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    const next = extractUserMessageEditParts(allBlocks);
    setEditParts(next.parts);
    setEditAttachments(next.attachments);
  }, [allBlocks]);

  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      cancelEdit();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [cancelEdit, editing]);

  const canResend = !isComposerEmpty(editParts) || editAttachments.length > 0;

  const appendPicked = useCallback(async (imagesOnly?: boolean) => {
    const picked = await pickComposerAttachments(
      imagesOnly ? { imagesOnly: true } : undefined,
    );
    if (picked.length === 0) return;
    const next = await Promise.all(picked.map((f) => projectFileToAttachment(f)));
    setEditAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.absolutePath));
      return [...prev, ...next.filter((a) => !seen.has(a.absolutePath))];
    });
  }, []);

  const handleResend = useCallback(async () => {
    if (!canResend || isStreaming || sending) return;
    setSending(true);
    try {
      await resendFromUserTurn({
        tabId: activeTabId,
        turnIndex,
        parts: editParts,
        attachments: editAttachments,
      });
      setEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("chat.messages.resendFailed"),
      );
    } finally {
      setSending(false);
    }
  }, [
    activeTabId,
    canResend,
    editAttachments,
    editParts,
    isStreaming,
    sending,
    t,
    turnIndex,
  ]);

  const onBubbleClick = () => {
    if (editing || isStreaming || sending) return;
    if (long && !expanded) {
      setExpanded(true);
      return;
    }
    beginEdit();
  };

  const addMenu = (
    <AppMenu>
      <Hint label={t("chat.composer.addContext")}>
        <AppMenuTrigger asChild>
          <button type="button" className={COMPOSER_TOOLBAR_ICON_BUTTON}>
            <PlusIcon className="size-3" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="min-w-[7.5rem]">
        <AppMenuItem onClick={() => void appendPicked()}>
          {t("chat.composer.addFile")}
        </AppMenuItem>
        <AppMenuItem onClick={() => void appendPicked(true)}>
          {t("chat.composer.addImage")}
        </AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  );

  const sendControls = (
    <Hint label={t("chat.messages.resend")}>
      <button
        type="button"
        disabled={!canResend || sending || isStreaming}
        aria-label={t("chat.messages.resend")}
        onClick={() => void handleResend()}
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
      >
        <ArrowUpIcon className="size-3.5" />
      </button>
    </Hint>
  );

  return (
    <div ref={rootRef} className="group sticky top-0 z-30 mx-3 mb-2">
      {editing ? (
        <div
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border bg-card",
            "rounded-lg shadow-[0_0_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-ring",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {editAttachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-0">
              {editAttachments.map((att) => (
                <span
                  key={att.id}
                  className="group/att relative inline-flex max-w-[10rem] items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 py-1"
                >
                  {att.kind === "image" && att.previewUrl ? (
                    <button
                      type="button"
                      aria-label={t("chat.composer.previewAttachment", { name: att.name })}
                      onClick={() => setImagePreview({ url: att.previewUrl!, name: att.name })}
                      className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="size-8 rounded object-cover transition-opacity hover:opacity-90"
                      />
                    </button>
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded bg-card">
                      <FileIcon className="size-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 truncate font-mono text-[length:var(--font-chat-meta)] text-muted-foreground">
                    {att.name}
                  </span>
                  <button
                    type="button"
                    aria-label={t("chat.composer.removeAttachment", { name: att.name })}
                    onClick={() =>
                      setEditAttachments((prev) => prev.filter((a) => a.id !== att.id))
                    }
                    className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <InlineComposerEditor
            parts={editParts}
            onChange={setEditParts}
            experts={experts}
            files={mentionableFiles}
            searchCommands={searchCommands}
            slashSkills={slashSkills}
            slashMcps={slashMcps}
            onEnter={() => void handleResend()}
            placeholder={t("chat.composer.placeholder")}
            density="default"
            registerGlobal={false}
            escapeBlurs
            onExternalFiles={(paths) => {
              void (async () => {
                const { attachmentsFromAbsolutePaths } = await import(
                  "@/lib/chat/composer-attach-file"
                );
                const next = await attachmentsFromAbsolutePaths(paths);
                setEditAttachments((prev) => {
                  const seen = new Set(prev.map((a) => a.absolutePath));
                  return [...prev, ...next.filter((a) => !seen.has(a.absolutePath))];
                });
              })();
            }}
          />

          <ComposerToolbar addMenu={addMenu} sendControls={sendControls} />
        </div>
      ) : (
        <div
          className={cn(
            "rounded-lg border border-border bg-card px-4 py-2 shadow-[0_0_6px_rgba(0,0,0,0.06)]",
            !isStreaming && "cursor-pointer transition-colors hover:bg-accent",
          )}
          onClick={onBubbleClick}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {!hasInlineParts && (profileBlocks.length > 0 || commandBlocks.length > 0) && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1">
                  {profileBlocks.map((block, i) => (
                    <InlineTokenChip
                      key={`profile-${i}`}
                      variant="profile"
                      prefix="@"
                      label={block.name ?? "profile"}
                    />
                  ))}
                  {commandBlocks.map((block, i) => (
                    <InlineTokenChip
                      key={i}
                      variant={(block as ContentBlock & { action?: string }).action ? "command-action" : "command"}
                      prefix="/"
                      label={block.name ?? "command"}
                    />
                  ))}
                </div>
              )}
              {initial.attachments.length > 0 && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {initial.attachments.map((att) => (
                    <AttachmentChip
                      key={att.id}
                      att={att}
                      onPreview={(url, name) => setImagePreview({ url, name })}
                    />
                  ))}
                </div>
              )}
              {(hasInlineParts || text) && (
                <span
                  className={cn(
                    "text-[length:var(--font-chat-message)] text-foreground",
                    long && !expanded ? "line-clamp-2" : "whitespace-pre-wrap break-words",
                  )}
                >
                  {hasInlineParts ? (
                    <InlineRichText parts={initial.parts} />
                  ) : text ? (
                    <InlineRichText text={text} />
                  ) : null}
                </span>
              )}
              {!hasBody && (
                <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                  (attachment)
                </span>
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <CopyButton text={text} />
            </div>
          </div>
          {long && !expanded ? (
            <div className="mt-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground">
              {t("chat.messages.expand")}
            </div>
          ) : null}
          {long && expanded ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
              className={cn(
                "mt-1 -mx-4 -mb-2 w-[calc(100%+2rem)] rounded-b-lg px-4 pb-2 pt-1",
                "text-left text-[length:var(--font-chat-meta)] text-muted-foreground",
                "cursor-pointer transition-colors hover:bg-accent hover:text-foreground",
              )}
            >
              {t("chat.messages.collapse")}
            </button>
          ) : null}
        </div>
      )}
      {attachedBelow ? <div className="mt-0">{attachedBelow}</div> : null}
      <ChatImagePreviewDialog
        open={imagePreview != null}
        onOpenChange={(open) => !open && setImagePreview(null)}
        url={imagePreview?.url ?? null}
        name={imagePreview?.name ?? "Image preview"}
      />
    </div>
  );
});

function AttachmentChip({
  att,
  onPreview,
}: {
  att: ComposerAttachment;
  onPreview: (url: string, name: string) => void;
}) {
  return (
    <span className="inline-flex max-w-[9rem] items-center gap-1.5 rounded-md border border-border bg-muted px-1.5 py-0.5">
      {att.kind === "image" && att.previewUrl ? (
        <button
          type="button"
          aria-label={`Preview ${att.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onPreview(att.previewUrl!, att.name);
          }}
          className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={att.previewUrl}
            alt={att.name}
            className="size-7 rounded object-cover transition-opacity hover:opacity-90"
          />
        </button>
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded bg-card">
          <FileIcon className="size-3.5 text-muted-foreground" />
        </span>
      )}
      <span className="truncate font-mono text-[length:var(--font-chat-meta)] text-muted-foreground">
        {att.name}
      </span>
    </span>
  );
}
