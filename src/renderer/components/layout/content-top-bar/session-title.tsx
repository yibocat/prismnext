import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { useWorktreeStore } from "@/stores/worktree-store";
import {
  FolderOpenIcon,
  BotIcon,
  GitBranchIcon,
} from "lucide-react";

interface SessionTitleProps {
  title: string;
  projectRoot: string | null;
  agentName: string;
}

export function SessionTitle({
  title,
  projectRoot,
  agentName,
}: SessionTitleProps) {
  const projectName = projectRoot
    ? projectRoot.split("/").pop() || projectRoot
    : "—";

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const mode = useWorktreeStore((s) => s.mode);
  const worktreeLabel = activeWorktree?.name
    ? `📂 ${activeWorktree.name}`
    : mode === "worktree"
      ? "Pending worktree"
      : "Local";

  return (
    <div className="flex items-center min-w-0 max-w-[240px]">
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="truncate rounded px-2 py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground hover:text-foreground transition-colors max-w-full"
          >
            {title}
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" align="start" className="w-64 p-3">
          <div className="space-y-2">
            {/* Project */}
            <div className="flex items-start gap-2">
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
              <div className="min-w-0">
                <div className="text-[length:var(--font-chat-meta)] text-foreground truncate">
                  {projectName}
                </div>
                <div className="text-[length:var(--font-hint)] text-muted-foreground truncate">
                  {projectRoot || "—"}
                </div>
              </div>
            </div>
            {/* Agent */}
            <div className="flex items-center gap-2">
              <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] text-foreground">
                {agentName}
              </span>
            </div>
            {/* Worktree */}
            <div className="flex items-center gap-2">
              <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                {worktreeLabel}
              </span>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
