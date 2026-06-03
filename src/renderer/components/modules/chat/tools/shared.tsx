import { useMemo } from "react";
import { diffLines } from "diff";
import { Loader2Icon, CheckIcon, AlertCircleIcon } from "lucide-react";

// ─── Status Icon ───

export function StatusIcon({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  if (isLoading) return <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />;
  if (isError) return <AlertCircleIcon className="size-3.5 text-destructive" />;
  return <CheckIcon className="size-3.5 text-success" />;
}

// ─── Diff Renderer ───

export function DiffLines({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const changes = useMemo(() => diffLines(oldStr, newStr), [oldStr, newStr]);

  const rows: { type: "same" | "del" | "add" | "skip"; text: string }[] = [];
  let skipped = 0;

  for (const change of changes) {
    const lines = change.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();

    if (change.added) {
      skipped = 0;
      for (const line of lines) rows.push({ type: "add", text: line });
    } else if (change.removed) {
      skipped = 0;
      for (const line of lines) rows.push({ type: "del", text: line });
    } else {
      for (const line of lines) {
        skipped++;
        if (skipped === 3) rows.push({ type: "skip", text: "" });
      }
    }
  }

  const displayRows = rows.slice(0, 200);

  return (
    <>
      {displayRows.map((row, i) => {
        if (row.type === "skip") return <div key={i} className="text-muted-foreground/40 select-none">···</div>;
        if (row.type === "del") return <div key={i} className="text-destructive/80 bg-destructive/5">- {row.text}</div>;
        if (row.type === "add") return <div key={i} className="text-success/80 bg-success/5">+ {row.text}</div>;
        return null;
      })}
      {rows.length > 200 && (
        <div className="text-muted-foreground/50 text-[length:var(--font-chat-meta)] mt-1">··· {rows.length - 200} more lines</div>
      )}
    </>
  );
}
