import { useEffect, useRef, type ReactNode } from "react";
import { BotIcon, BookOpenIcon, FileCodeIcon, FileIcon, FileTextIcon, ImageIcon, PlugIcon, PuzzleIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appPopoverLabelClass, appPopoverListClass } from "@/components/ui/app-popover";
import { appMenuItemClass } from "@/components/ui/app-menu";
import { cn } from "@/lib/utils";
import type { AgentProfileInfo } from "@shared/agent-profiles";
import type { ProjectFile } from "@/stores/document-store";
import type { LiteraturePaper } from "@/types/electron.d";
import { formatPaperMentionLabel } from "../../../../../shared/bibkey-utils";
import type { CommandDef } from "@commands/types";
import type { CursorAnchor } from "./dropdown-position";
import { preferredMenuSide } from "./dropdown-position";
import type { SlashCatalogMcp, SlashCatalogSkill } from "@/lib/chat/slash-catalog";

export type { SlashCatalogMcp, SlashCatalogSkill };

export type MentionOption =
  | { kind: "profile"; profile: AgentProfileInfo }
  | { kind: "paper"; paper: LiteraturePaper }
  | { kind: "file"; file: ProjectFile };

export type SlashOption =
  | { kind: "command"; command: CommandDef }
  | { kind: "skill"; skill: SlashCatalogSkill }
  | { kind: "mcp"; mcp: SlashCatalogMcp };

const SLASH_LIMITS = { command: 10, skill: 8, mcp: 8 } as const;

const SLASH_SECTION_LABELS: Record<SlashOption["kind"], string> = {
  command: "Commands",
  skill: "Skills",
  mcp: "MCPs",
};

export function buildSlashOptions(
  query: string,
  commands: CommandDef[],
  skills: SlashCatalogSkill[],
  mcps: SlashCatalogMcp[],
): SlashOption[] {
  const q = query.toLowerCase();
  const options: SlashOption[] = [];

  let commandCount = 0;
  for (const command of commands) {
    if (commandCount >= SLASH_LIMITS.command) break;
    if (command.name.toLowerCase().includes(q) || command.description.toLowerCase().includes(q)) {
      options.push({ kind: "command", command });
      commandCount++;
    }
  }

  let skillCount = 0;
  for (const skill of skills) {
    if (skillCount >= SLASH_LIMITS.skill) break;
    if (
      skill.enabled &&
      (skill.name.toLowerCase().includes(q) || skill.id.toLowerCase().includes(q))
    ) {
      options.push({ kind: "skill", skill });
      skillCount++;
    }
  }

  let mcpCount = 0;
  for (const mcp of mcps) {
    if (mcpCount >= SLASH_LIMITS.mcp) break;
    if (mcp.name.toLowerCase().includes(q)) {
      options.push({ kind: "mcp", mcp });
      mcpCount++;
    }
  }

  return options;
}

const itemClass = (active: boolean) =>
  cn(
    appMenuItemClass,
    "flex w-full items-center text-left",
    active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
  );

const itemLabelClass = "min-w-0 flex-1 truncate";
const itemMetaClass =
  "ml-auto max-w-[5rem] shrink-0 truncate text-muted-foreground text-[length:var(--font-path)]";
const sectionLabelClass = appPopoverLabelClass;

const COMPOSER_POPOVER_CLASS = cn(appPopoverListClass, "w-56 max-h-60 overflow-y-auto");

function getFileIcon(file: ProjectFile) {
  if (file.type === "image")
    return <ImageIcon className="size-3 shrink-0 text-muted-foreground" />;
  if (file.type === "style")
    return <FileCodeIcon className="size-3 shrink-0 text-muted-foreground" />;
  if (file.type === "other")
    return <FileIcon className="size-3 shrink-0 text-muted-foreground" />;
  return <FileTextIcon className="size-3 shrink-0 text-muted-foreground" />;
}

function ComposerQueryPopover({
  open,
  anchor,
  activeIndex,
  onListPointerMove,
  children,
}: {
  open: boolean;
  anchor: CursorAnchor | null;
  activeIndex: number;
  /** Re-enable mouse hover after keyboard scroll (avoids stale cursor hitting row 0). */
  onListPointerMove?: () => void;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const side = anchor ? preferredMenuSide(anchor) : "bottom";

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  if (!anchor) return null;

  const lineHeight = Math.max(anchor.bottom - anchor.top, 14);

  return (
    <Popover open={open} modal={false}>
      <PopoverTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed z-50 border-0 opacity-0 outline-none"
          style={{
            left: anchor.left,
            top: anchor.top,
            width: 0,
            height: lineHeight,
            outline: "none",
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={4}
        collisionPadding={12}
        className={COMPOSER_POPOVER_CLASS}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div
          ref={listRef}
          onPointerMove={onListPointerMove}
        >
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SlashCommandDropdown({
  options,
  activeIndex,
  anchor,
  open,
  onSelect,
  onHover,
  onListPointerMove,
  canHoverItem,
}: {
  options: SlashOption[];
  activeIndex: number;
  anchor: CursorAnchor | null;
  open: boolean;
  onSelect: (option: SlashOption) => void;
  onHover: (index: number) => void;
  onListPointerMove?: () => void;
  canHoverItem?: () => boolean;
}) {
  let lastKind: SlashOption["kind"] | null = null;

  return (
    <ComposerQueryPopover
      open={open}
      anchor={anchor}
      activeIndex={activeIndex}
      onListPointerMove={onListPointerMove}
    >
      {options.length > 0 ? (
        options.map((option, i) => {
          const showHeader = option.kind !== lastKind;
          lastKind = option.kind;

          const row = (() => {
            if (option.kind === "command") {
              return (
                <span className={cn(itemLabelClass, "font-medium text-primary")}>
                  /{option.command.name}
                </span>
              );
            }
            if (option.kind === "skill") {
              return (
                <>
                  <PuzzleIcon className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className={itemLabelClass}>{option.skill.name}</span>
                </>
              );
            }
            return (
              <>
                <PlugIcon className="size-3 shrink-0 text-sky-600 dark:text-sky-400" />
                <span className={itemLabelClass}>{option.mcp.name}</span>
              </>
            );
          })();

          return (
            <div key={`${option.kind}:${option.kind === "command" ? option.command.name : option.kind === "skill" ? option.skill.id : option.mcp.name}`}>
              {showHeader && <div className={sectionLabelClass}>{SLASH_SECTION_LABELS[option.kind]}</div>}
              <button
                type="button"
                data-active={i === activeIndex}
                className={itemClass(i === activeIndex)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(option);
                }}
                onMouseEnter={() => {
                  if (canHoverItem && !canHoverItem()) return;
                  onHover(i);
                }}
              >
                {row}
              </button>
            </div>
          );
        })
      ) : (
        <div className="px-2 py-1.5 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
          No matches
        </div>
      )}
    </ComposerQueryPopover>
  );
}

export function MentionDropdown({
  options,
  activeIndex,
  anchor,
  open,
  onSelectProfile,
  onSelectFile,
  onSelectPaper,
  onHover,
  onListPointerMove,
  canHoverItem,
}: {
  options: MentionOption[];
  activeIndex: number;
  anchor: CursorAnchor | null;
  open: boolean;
  onSelectProfile: (profile: AgentProfileInfo) => void;
  onSelectFile: (file: ProjectFile) => void;
  onSelectPaper?: (paper: LiteraturePaper) => void;
  onHover: (index: number) => void;
  onListPointerMove?: () => void;
  canHoverItem?: () => boolean;
}) {
  return (
    <ComposerQueryPopover
      open={open}
      anchor={anchor}
      activeIndex={activeIndex}
      onListPointerMove={onListPointerMove}
    >
      {options.length === 0 ? (
        <div className="px-2 py-1.5 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
          No agents, papers, or files found
        </div>
      ) : (
        options.map((option, i) => {
          const showProfileHeader =
            option.kind === "profile" && (i === 0 || options[i - 1]?.kind !== "profile");
          const showFileHeader =
            option.kind === "file" && (i === 0 || options[i - 1]?.kind !== "file");
          const showPaperHeader =
            option.kind === "paper" && (i === 0 || options[i - 1]?.kind !== "paper");

          if (option.kind === "profile") {
            const { profile } = option;
            return (
              <div key={`profile:${profile.id}`}>
                {showProfileHeader && <div className={sectionLabelClass}>Agents</div>}
                <button
                  type="button"
                  data-active={i === activeIndex}
                  className={itemClass(i === activeIndex)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectProfile(profile);
                  }}
                  onMouseEnter={() => {
                  if (canHoverItem && !canHoverItem()) return;
                  onHover(i);
                }}
                >
                  <BotIcon className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className={cn(itemLabelClass, "font-medium")}>{profile.name}</span>
                </button>
              </div>
            );
          }

          if (option.kind === "paper") {
            const { paper } = option;
            return (
              <div key={`paper:${paper.id}`}>
                {showPaperHeader && <div className={sectionLabelClass}>Literature</div>}
                <button
                  type="button"
                  data-active={i === activeIndex}
                  className={itemClass(i === activeIndex)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectPaper?.(paper);
                  }}
                  onMouseEnter={() => {
                    if (canHoverItem && !canHoverItem()) return;
                    onHover(i);
                  }}
                >
                  <BookOpenIcon className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className={cn(itemLabelClass, "shrink-0 font-mono font-medium")}>
                    {formatPaperMentionLabel(paper.bibkey)}
                  </span>
                  <span className="truncate text-muted-foreground">{paper.title}</span>
                </button>
              </div>
            );
          }

          const { file } = option;
          const pathParts = file.relativePath.split("/");
          const fileName = pathParts.pop()!;
          const dirPath = pathParts.length > 0 ? `${pathParts.join("/")}/` : "";

          return (
            <div key={`file:${file.id}`}>
              {showFileHeader && <div className={sectionLabelClass}>Files</div>}
              <button
                type="button"
                data-active={i === activeIndex}
                className={itemClass(i === activeIndex)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectFile(file);
                }}
                onMouseEnter={() => {
                  if (canHoverItem && !canHoverItem()) return;
                  onHover(i);
                }}
              >
                {getFileIcon(file)}
                <span className={itemLabelClass}>{fileName}</span>
                {dirPath && <span className={itemMetaClass}>{dirPath}</span>}
              </button>
            </div>
          );
        })
      )}
    </ComposerQueryPopover>
  );
}
