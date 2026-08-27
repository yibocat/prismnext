import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GitBranchIcon, Loader2Icon } from "lucide-react";
import { workingLens } from "@shared/git";
import { useGitStore } from "@/stores/git-store";
import { useLastAgentTurnLens } from "@/lib/git/agent-turn-lens";
import { pickDefaultBranch } from "@shared/git-hosting";
import { GitChangesDiffList } from "./git-changes-diff-list";
import { GitBranchChangesDetail, GitCommitDetail } from "./git-commit-detail";
import { filterGitFilesByLens } from "./git-changes-tree";
import { GitInitButton } from "./git-init-button";

interface GitViewerProps {
  projectRoot: string;
}

export default function GitViewer({ projectRoot }: GitViewerProps) {
  const { t } = useTranslation();
  const selectedCommitHash = useGitStore((s) => s.selectedCommitHash);
  const sidebarView = useGitStore((s) => s.sidebarView);
  const files = useGitStore((s) => s.files);
  const changesLens = useGitStore((s) => s.changesLens);
  const filterMode = useGitStore((s) => s.filterMode);
  const commits = useGitStore((s) => s.commits);
  const branchCommits = useGitStore((s) => s.branchCommits);
  const branches = useGitStore((s) => s.branches);
  const unitRoot = useGitStore((s) => s.unitRoot);
  const isGitRepo = useGitStore((s) => s.isGitRepo);
  const repoKnown = useGitStore((s) => s.repoKnown);
  const checkingRepo = useGitStore((s) => s.checkingRepo);
  const lastTurn = useLastAgentTurnLens();

  const gitRoot = unitRoot ?? projectRoot;
  const filteredFiles = useMemo(
    () => filterGitFilesByLens(files, changesLens, lastTurn.paths),
    [files, changesLens, lastTurn.paths],
  );

  if (checkingRepo) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (!isGitRepo) {
    if (!repoKnown) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <GitBranchIcon className="size-8 text-muted-foreground/40" />
          <div className="space-y-1.5 max-w-sm">
            <p className="text-[length:var(--font-size-14)] font-medium text-foreground/90">
              {t("modes.git.noRepoOffline")}
            </p>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground">
              {t("modes.git.noRepoHintOffline")}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <GitBranchIcon className="size-8 text-muted-foreground/40" />
        <div className="space-y-1.5 max-w-sm">
          <p className="text-[length:var(--font-size-14)] font-medium text-foreground/90">
            {t("modes.git.noRepo")}
          </p>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {t("modes.git.noRepoHintInit")}
          </p>
        </div>
        <GitInitButton variant="panel" />
      </div>
    );
  }

  if (sidebarView === "history" && selectedCommitHash) {
    const commit = commits.find((c) => c.hash === selectedCommitHash);

    if (!commit) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            {t("modes.git.commitNotFound")}
          </p>
        </div>
      );
    }

    return <GitCommitDetail gitRoot={gitRoot} commit={commit} />;
  }

  if (sidebarView === "changes" && changesLens.kind === "branch-changes") {
    const baseBranch = pickDefaultBranch(branches);
    if (!baseBranch) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            {t("git.filter.branchChangesEmpty")}
          </p>
        </div>
      );
    }
    return <GitBranchChangesDetail gitRoot={gitRoot} baseBranch={baseBranch} />;
  }

  if (sidebarView === "changes" && changesLens.kind === "commit") {
    const commit =
      branchCommits.find((item) => item.hash === changesLens.hash)
      ?? commits.find((item) => item.hash === changesLens.hash);

    if (!commit) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            {t("modes.git.commitNotFound")}
          </p>
        </div>
      );
    }

    return (
      <GitCommitDetail
        gitRoot={gitRoot}
        commit={commit}
        onBack={() => useGitStore.getState().setChangesLens(workingLens(filterMode))}
      />
    );
  }

  if (sidebarView === "changes") {
    return <GitChangesDiffList files={filteredFiles} gitRoot={gitRoot} />;
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
        {t("modes.git.selectCommit")}
      </p>
    </div>
  );
}
