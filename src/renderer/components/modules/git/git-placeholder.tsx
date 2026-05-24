import { GitBranchIcon } from "lucide-react";

export function GitPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <GitBranchIcon className="size-10 opacity-30" />
      <p className="text-[length:var(--font-placeholder)]">Git changes will appear here</p>
      <p className="text-[length:var(--font-placeholder)] opacity-50">Coming soon</p>
    </div>
  );
}
