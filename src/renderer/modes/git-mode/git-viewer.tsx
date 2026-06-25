import { useGitStore } from "@/stores/git-store";
import { GitChangesDiffList } from "./git-changes-diff-list";
import { GitCommitDetail } from "./git-commit-detail";
import { filterGitFilesByMode } from "./git-changes-tree";

interface GitViewerProps {
  projectRoot: string;
}

export default function GitViewer({ projectRoot }: GitViewerProps) {
  const selectedCommitHash = useGitStore((s) => s.selectedCommitHash);
  const sidebarView = useGitStore((s) => s.sidebarView);
  const files = useGitStore((s) => s.files);
  const filterMode = useGitStore((s) => s.filterMode);
  const commits = useGitStore((s) => s.commits);
  const unitRoot = useGitStore((s) => s.unitRoot);

  const gitRoot = unitRoot ?? projectRoot;
  const filteredFiles = filterGitFilesByMode(files, filterMode);

  if (selectedCommitHash) {
    const commit = commits.find((c) => c.hash === selectedCommitHash);

    if (!commit) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
            Commit not found
          </p>
        </div>
      );
    }

    return <GitCommitDetail gitRoot={gitRoot} commit={commit} />;
  }

  if (sidebarView === "changes") {
    return <GitChangesDiffList files={filteredFiles} gitRoot={gitRoot} />;
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
        Select a commit to view details
      </p>
    </div>
  );
}
