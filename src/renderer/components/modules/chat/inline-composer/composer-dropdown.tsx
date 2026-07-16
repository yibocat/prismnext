import { useEffect, useRef, type ReactNode } from "react";
import {
  BotIcon,
  BookOpenIcon,
  ChevronRightIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FlaskConicalIcon,
  ImageIcon,
  PlugIcon,
  PuzzleIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appPopoverLabelClass, appPopoverListClass } from "@/components/ui/app-popover";
import {
  AppMenu,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSidePanel,
  AppMenuSwitchRow,
  AppMenuTrigger,
  appMenuFontClass,
  appMenuInlineChevronTriggerClass,
} from "@/components/ui/app-menu";
import { cn } from "@/lib/utils";
import type { ExpertInfo } from "@shared/agent-experts";
import type { ProjectFile } from "@/stores/document-store";
import type { LiteraturePaper } from "@/types/electron.d";
import { formatPaperMentionLabel } from "../../../../../shared/bibkey-utils";
import { PAPER_EXTRACT_ACTION_HINT_FIRST } from "../../../../../shared/paper-extract";
import type { ExperimentSummary } from "../../../../../shared/experiment-log";
import type { CommandDef } from "@commands/types";
import type { CursorAnchor } from "./dropdown-position";
import { preferredMenuSide } from "./dropdown-position";
import type { SlashCatalogMcp, SlashCatalogSkill } from "@/lib/chat/slash-catalog";

export type { SlashCatalogMcp, SlashCatalogSkill };

export type MentionSectionKind = "expert" | "paper" | "file" | "experiment";

export type MentionOption =
  | { kind: "expert"; expert: ExpertInfo }
  | { kind: "paper"; paper: LiteraturePaper }
  | { kind: "file"; file: ProjectFile }
  | { kind: "experiment"; experiment: ExperimentSummary }
  | { kind: "show-more"; section: MentionSectionKind; remaining: number };

export type SlashSectionKind = "command" | "skill" | "mcp";

export type SlashOption =
  | { kind: "command"; command: CommandDef }
  | { kind: "skill"; skill: SlashCatalogSkill }
  | { kind: "mcp"; mcp: SlashCatalogMcp }
  | { kind: "show-more"; section: SlashSectionKind; remaining: number };

export const MENTIONS_LIMIT = 6;
const SLASH_LIMITS = { command: 10, skill: 8, mcp: 8 } as const;

const SLASH_SECTION_LABELS: Record<SlashSectionKind, string> = {
  command: "Commands",
  skill: "Skills",
  mcp: "MCPs",
};

function appendLimitedSection<T, O extends { kind: string }>(
  out: O[],
  matched: T[],
  limit: number,
  expanded: boolean,
  section: string,
  mapItem: (item: T) => O,
  makeMore: (remaining: number) => O,
) {
  if (expanded || matched.length <= limit) {
    for (const item of matched) out.push(mapItem(item));
    return;
  }
  for (const item of matched.slice(0, limit)) out.push(mapItem(item));
  out.push(makeMore(matched.length - limit));
}

export function buildSlashOptions(
  query: string,
  commands: CommandDef[],
  skills: SlashCatalogSkill[],
  mcps: SlashCatalogMcp[],
  expandedSections: ReadonlySet<SlashSectionKind> = new Set(),
): SlashOption[] {
  const q = query.toLowerCase();
  const options: SlashOption[] = [];

  const matchedCommands = commands.filter(
    (command) =>
      command.name.toLowerCase().includes(q) || command.description.toLowerCase().includes(q),
  );
  appendLimitedSection(
    options,
    matchedCommands,
    SLASH_LIMITS.command,
    expandedSections.has("command"),
    "command",
    (command) => ({ kind: "command" as const, command }),
    (remaining) => ({ kind: "show-more" as const, section: "command" as const, remaining }),
  );

  const matchedSkills = skills.filter(
    (skill) =>
      skill.enabled &&
      (skill.name.toLowerCase().includes(q) || skill.id.toLowerCase().includes(q)),
  );
  appendLimitedSection(
    options,
    matchedSkills,
    SLASH_LIMITS.skill,
    expandedSections.has("skill"),
    "skill",
    (skill) => ({ kind: "skill" as const, skill }),
    (remaining) => ({ kind: "show-more" as const, section: "skill" as const, remaining }),
  );

  const matchedMcps = mcps.filter((mcp) => mcp.name.toLowerCase().includes(q));
  appendLimitedSection(
    options,
    matchedMcps,
    SLASH_LIMITS.mcp,
    expandedSections.has("mcp"),
    "mcp",
    (mcp) => ({ kind: "mcp" as const, mcp }),
    (remaining) => ({ kind: "show-more" as const, section: "mcp" as const, remaining }),
  );

  return options;
}

const itemClass = (active: boolean) =>
  cn(
    "flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[length:var(--font-menu-item)]",
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
  className,
  children,
}: {
  open: boolean;
  anchor: CursorAnchor | null;
  activeIndex: number;
  /** Re-enable mouse hover after keyboard scroll (avoids stale cursor hitting row 0). */
  onListPointerMove?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const side = anchor ? preferredMenuSide(anchor) : "bottom";

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!active) return;
    // Scroll the whole option group so the section label stays visible when wrapping to top.
    const group = active.closest("[data-composer-option-group]") as HTMLElement | null;
    const target = group ?? active;
    target.scrollIntoView({
      block: activeIndex === 0 ? "start" : "nearest",
    });
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
        className={className ?? COMPOSER_POPOVER_CLASS}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div ref={listRef} onPointerMove={onListPointerMove}>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PaperMentionOptionsMenu({
  open,
  onOpenChange,
  paper,
  intensiveOn,
  ready,
  subFocusIndex,
  onSelectPaper,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paper: LiteraturePaper;
  intensiveOn: boolean;
  ready: boolean;
  subFocusIndex: number;
  onSelectPaper: () => void;
  onToggle: (on: boolean) => void;
}) {
  return (
    <AppMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={appMenuInlineChevronTriggerClass}
          aria-label="Paper options"
          aria-expanded={open}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ChevronRightIcon className="size-3.5 opacity-70" />
        </button>
      </AppMenuTrigger>
      <AppMenuSidePanel>
        <AppMenuLabel className="normal-case tracking-normal text-[length:var(--font-size-11)]">
          Options
        </AppMenuLabel>
        <AppMenuItem
          className={cn(subFocusIndex === 0 && "bg-accent text-accent-foreground")}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelectPaper();
          }}
        >
          <span className="min-w-0 flex-1 truncate font-medium">{paper.title}</span>
          <span className="shrink-0 font-mono text-[length:var(--font-path)] text-muted-foreground">
            {formatPaperMentionLabel(paper.bibkey)}
          </span>
        </AppMenuItem>
        <AppMenuSwitchRow
          label="Intensive reading"
          checked={intensiveOn}
          disabled={!ready}
          enterToggles={false}
          className={cn(subFocusIndex === 1 && "bg-accent text-accent-foreground")}
          onCheckedChange={onToggle}
          title={!ready ? PAPER_EXTRACT_ACTION_HINT_FIRST : undefined}
        />
        {!ready ? (
          <p className={cn("px-2 pb-1 text-muted-foreground", appMenuFontClass)}>
            {PAPER_EXTRACT_ACTION_HINT_FIRST}
          </p>
        ) : null}
      </AppMenuSidePanel>
    </AppMenu>
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
  let lastSection: SlashSectionKind | null = null;

  return (
    <ComposerQueryPopover
      open={open}
      anchor={anchor}
      activeIndex={activeIndex}
      onListPointerMove={onListPointerMove}
    >
      {options.length > 0 ? (
        options.map((option, i) => {
          const section: SlashSectionKind =
            option.kind === "show-more" ? option.section : option.kind;
          const showHeader = option.kind !== "show-more" && section !== lastSection;
          lastSection = section;

          const row = (() => {
            if (option.kind === "show-more") {
              return (
                <span className={cn(itemLabelClass, "text-muted-foreground")}>
                  Show {option.remaining} more
                </span>
              );
            }
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

          const rowKey =
            option.kind === "show-more"
              ? `show-more:${option.section}`
              : option.kind === "command"
                ? `command:${option.command.name}`
                : option.kind === "skill"
                  ? `skill:${option.skill.id}`
                  : `mcp:${option.mcp.name}`;

          return (
            <div key={rowKey} data-composer-option-group>
              {showHeader && <div className={sectionLabelClass}>{SLASH_SECTION_LABELS[section]}</div>}
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
  onSelectExpert,
  onSelectFile,
  onSelectPaper,
  onSelectExperiment,
  onSelectShowMore,
  onHover,
  onListPointerMove,
  canHoverItem,
  intensivePaperIds,
  readyPaperIds,
  onToggleIntensive,
  paperOptionsOpenIndex,
  onPaperOptionsOpenChange,
  paperOptionsSubIndex,
  expertSectionLabel = "Experts",
}: {
  options: MentionOption[];
  activeIndex: number;
  anchor: CursorAnchor | null;
  open: boolean;
  onSelectExpert: (expert: ExpertInfo) => void;
  onSelectFile: (file: ProjectFile) => void;
  onSelectPaper?: (paper: LiteraturePaper) => void;
  onSelectExperiment?: (experiment: ExperimentSummary) => void;
  onSelectShowMore?: (section: MentionSectionKind) => void;
  onHover: (index: number) => void;
  onListPointerMove?: () => void;
  canHoverItem?: () => boolean;
  intensivePaperIds?: string[];
  readyPaperIds?: Set<string>;
  onToggleIntensive?: (paperId: string, on: boolean) => void;
  paperOptionsOpenIndex?: number | null;
  onPaperOptionsOpenChange?: (index: number | null) => void;
  paperOptionsSubIndex?: number;
  /** Section header for @ expert rows. */
  expertSectionLabel?: string;
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
          No agents, papers, files, or experiments found
        </div>
      ) : (
        options.map((option, i) => {
          const prev = options[i - 1];
          const prevSection =
            prev == null
              ? null
              : prev.kind === "show-more"
                ? prev.section
                : prev.kind;
          const section =
            option.kind === "show-more" ? option.section : option.kind;
          const showSectionHeader =
            option.kind !== "show-more" && section !== prevSection;
          const active = i === activeIndex;

          if (option.kind === "show-more") {
            return (
              <div key={`show-more:${option.section}`} data-composer-option-group>
                <button
                  type="button"
                  data-active={active ? "true" : undefined}
                  className={itemClass(active)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectShowMore?.(option.section);
                  }}
                  onMouseEnter={() => {
                    if (canHoverItem && !canHoverItem()) return;
                    onHover(i);
                  }}
                >
                  <span className={cn(itemLabelClass, "text-muted-foreground")}>
                    Show {option.remaining} more
                  </span>
                </button>
              </div>
            );
          }

          if (option.kind === "expert") {
            const { expert } = option;
            return (
              <div key={`expert:${expert.id}`} data-composer-option-group>
                {showSectionHeader && (
                  <div className={sectionLabelClass}>{expertSectionLabel}</div>
                )}
                <button
                  type="button"
                  data-active={active ? "true" : undefined}
                  className={itemClass(active)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectExpert(expert);
                  }}
                  onMouseEnter={() => {
                    if (canHoverItem && !canHoverItem()) return;
                    onHover(i);
                  }}
                >
                  <BotIcon className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className={cn(itemLabelClass, "font-medium")}>{expert.name}</span>
                </button>
              </div>
            );
          }

          if (option.kind === "paper") {
            const { paper } = option;
            const intensiveOn = intensivePaperIds?.includes(paper.id) ?? false;
            const ready = readyPaperIds?.has(paper.id) ?? false;

            return (
              <div key={`paper:${paper.id}`} data-composer-option-group>
                {showSectionHeader && <div className={sectionLabelClass}>Literature</div>}
                <button
                  type="button"
                  data-active={active ? "true" : undefined}
                  className={itemClass(active)}
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
                  <span className={cn(itemLabelClass, "font-medium")}>{paper.title}</span>
                  <span className={cn(itemMetaClass, "font-mono")}>
                    {formatPaperMentionLabel(paper.bibkey)}
                  </span>
                  {intensiveOn ? (
                    <span className="shrink-0 text-[length:var(--font-size-10)] text-amber-600 dark:text-amber-400">
                      Intensive
                    </span>
                  ) : null}
                  {onToggleIntensive ? (
                    <span className="ml-auto flex shrink-0 items-center">
                      <PaperMentionOptionsMenu
                        open={paperOptionsOpenIndex === i}
                        onOpenChange={(next) =>
                          onPaperOptionsOpenChange?.(next ? i : null)
                        }
                        paper={paper}
                        subFocusIndex={
                          paperOptionsOpenIndex === i ? (paperOptionsSubIndex ?? 0) : 0
                        }
                        intensiveOn={intensiveOn}
                        ready={ready}
                        onSelectPaper={() => onSelectPaper?.(paper)}
                        onToggle={(on) => onToggleIntensive(paper.id, on)}
                      />
                    </span>
                  ) : null}
                </button>
              </div>
            );
          }

          if (option.kind === "experiment") {
            const { experiment } = option;
            const runMeta = experiment.runCount > 0
              ? `${experiment.runCount} run${experiment.runCount === 1 ? "" : "s"}${experiment.lastRunAt ? ` · last ${experiment.lastRunAt}` : ""}`
              : "no runs yet";
            return (
              <div key={`experiment:${experiment.id}`} data-composer-option-group>
                {showSectionHeader && <div className={sectionLabelClass}>Experiments</div>}
                <button
                  type="button"
                  data-active={active ? "true" : undefined}
                  className={itemClass(active)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectExperiment?.(experiment);
                  }}
                  onMouseEnter={() => {
                    if (canHoverItem && !canHoverItem()) return;
                    onHover(i);
                  }}
                >
                  <FlaskConicalIcon className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className={cn(itemLabelClass, "font-medium")}>{experiment.title}</span>
                  <span className={cn(itemMetaClass)}>{runMeta}</span>
                </button>
              </div>
            );
          }

          const { file } = option;
          const pathParts = file.relativePath.split("/");
          const fileName = pathParts.pop()!;
          const dirPath = pathParts.length > 0 ? `${pathParts.join("/")}/` : "";

          return (
            <div key={`file:${file.id}`} data-composer-option-group>
              {showSectionHeader && <div className={sectionLabelClass}>Files</div>}
              <button
                type="button"
                data-active={active ? "true" : undefined}
                className={itemClass(active)}
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
                {dirPath ? <span className={itemMetaClass}>{dirPath}</span> : null}
              </button>
            </div>
          );
        })
      )}
    </ComposerQueryPopover>
  );
}
