import { useCallback, useState } from "react";
import { GitBranchIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useDocumentStore } from "@/stores/document-store";
import { useGitStore } from "@/stores/git-store";
import { CHAT_PANEL_TOOLBAR_BUTTON } from "@/components/modules/chat/worktree-selector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GitInitButtonVariant = "toolbar" | "panel";

export function GitInitButton({
  variant = "toolbar",
  className,
}: {
  variant?: GitInitButtonVariant;
  className?: string;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [loading, setLoading] = useState(false);

  const handleInit = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    try {
      await useGitStore.getState().initRepo(projectRoot);
      toast.success("Git repository initialized");
    } catch (err: unknown) {
      toast.error(`Failed to init git: ${(err as Error)?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  if (!projectRoot) return null;

  if (variant === "panel") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void handleInit()}
        disabled={loading}
        className={cn("gap-1.5", className)}
        title="Initialize Git repository"
      >
        {loading ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <GitBranchIcon className="size-3.5" />
        )}
        Init Git
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleInit()}
      disabled={loading}
      className={cn(
        CHAT_PANEL_TOOLBAR_BUTTON,
        "disabled:opacity-50 disabled:cursor-wait disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
        className,
      )}
      title="Initialize Git repository"
    >
      {loading ? (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <GitBranchIcon className="size-3.5 shrink-0" />
      )}
      <span className="max-w-[100px] truncate hidden @md:inline">Init Git</span>
    </button>
  );
}
