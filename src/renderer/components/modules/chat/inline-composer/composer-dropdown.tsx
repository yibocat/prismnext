import { useEffect, useRef, type ReactNode } from "react";
import { BotIcon, FileCodeIcon, FileIcon, FileTextIcon, ImageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentProfileInfo } from "@shared/agent-profiles";
import type { ProjectFile } from "@/stores/document-store";
import type { CommandDef } from "@commands/types";
import type { CursorAnchor } from "./dropdown-position";
import { preferredMenuSide } from "./dropdown-position";

export type MentionOption =
  | { kind: "profile"; profile: AgentProfileInfo }
  | { kind: "file"; file: ProjectFile };

const itemClass = (active: boolean) =>
  cn(
    "relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[length:var(--font-chat-meta)] outline-none",
    active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
  );

const sectionLabelClass =
  "px-2 pt-1.5 pb-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide text-muted-foreground/70";

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
  children,
}: {
  open: boolean;
  anchor: CursorAnchor | null;
  activeIndex: number;
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
          className="pointer-events-none fixed z-50"
          style={{
            left: anchor.left,
            top: anchor.top,
            width: 1,
            height: lineHeight,
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        sideOffset={4}
        collisionPadding={12}
        className="w-56 max-h-40 overflow-y-auto p-1 shadow-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div ref={listRef}>{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function SlashCommandDropdown({
  commands,
  activeIndex,
  anchor,
  open,
  onSelect,
  onHover,
}: {
  commands: CommandDef[];
  activeIndex: number;
  anchor: CursorAnchor | null;
  open: boolean;
  onSelect: (cmd: CommandDef) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ComposerQueryPopover open={open} anchor={anchor} activeIndex={activeIndex}>
      {commands.length > 0 ? (
        commands.map((cmd, i) => (
          <button
            key={cmd.name}
            type="button"
            data-active={i === activeIndex}
            className={itemClass(i === activeIndex)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            onMouseEnter={() => onHover(i)}
          >
            <span className="shrink-0 font-mono font-medium text-primary">/{cmd.name}</span>
            <span className="min-w-0 truncate text-muted-foreground">{cmd.description}</span>
          </button>
        ))
      ) : (
        <div className="px-2 py-1.5 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
          No commands found
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
  onHover,
}: {
  options: MentionOption[];
  activeIndex: number;
  anchor: CursorAnchor | null;
  open: boolean;
  onSelectProfile: (profile: AgentProfileInfo) => void;
  onSelectFile: (file: ProjectFile) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ComposerQueryPopover open={open} anchor={anchor} activeIndex={activeIndex}>
      {options.length === 0 ? (
        <div className="px-2 py-1.5 text-center text-[length:var(--font-chat-meta)] text-muted-foreground">
          No agents or files found
        </div>
      ) : (
        options.map((option, i) => {
          const showProfileHeader =
            option.kind === "profile" && (i === 0 || options[i - 1]?.kind !== "profile");
          const showFileHeader =
            option.kind === "file" && (i === 0 || options[i - 1]?.kind !== "file");

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
                  onMouseEnter={() => onHover(i)}
                >
                  <BotIcon className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  <span className="min-w-0 flex-1 truncate font-medium">{profile.name}</span>
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
                onMouseEnter={() => onHover(i)}
              >
                {getFileIcon(file)}
                <span className="min-w-0 truncate font-mono">{fileName}</span>
                {dirPath && (
                  <span className="ml-auto max-w-[5rem] shrink-0 truncate font-mono text-muted-foreground">
                    {dirPath}
                  </span>
                )}
              </button>
            </div>
          );
        })
      )}
    </ComposerQueryPopover>
  );
}
