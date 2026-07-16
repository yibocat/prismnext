import type { ModeDefinition } from "@/lib/workspace/mode-registry";
import { GitBranchIcon } from "lucide-react";
import { GitSidebar } from "./git-sidebar";
import { GitToolbarWrapper, GitContent } from "./git-content";
import { resolveGitRefreshRoot } from "@/lib/git/checkout-context";

export const gitMode: ModeDefinition = {
  id: "git",
  label: "Git",
  icon: <GitBranchIcon className="size-3.5" />,
  tabKinds: ["git-overview", "git-diff"],
  persistence: "transient",
  initialTitle: "Git",
  Sidebar: GitSidebar,
  Toolbar: GitToolbarWrapper,
  Content: GitContent,
  onActivate: () => {
    const root = resolveGitRefreshRoot();
    if (!root) return;
    import("@/stores/git-store").then(({ useGitStore }) => {
      const gs = useGitStore.getState();
      if (!gs.isGitRepo) {
        // Re-check without calling git:status (avoids fatal "not a git repository" toast).
        void gs.selectUnit(root);
        return;
      }
      if (gs.unitRoot === root) {
        void gs.forceRefreshStatus(root);
      } else {
        void gs.selectUnit(root);
      }
    });
  },
};
