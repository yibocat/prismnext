import { cn } from "@/lib/utils";
import { modelSupportsVision, type ModelConfig } from "@/lib/providers";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium shrink-0";

export function ModelCapabilityBadges({
  model,
  className,
}: {
  model?: ModelConfig;
  className?: string;
}) {
  if (!model) return null;
  const vision = modelSupportsVision(model);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {vision ? (
        <>
          <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Text</span>
          <span className={cn(BADGE, "bg-primary/10 text-primary")}>Vision</span>
        </>
      ) : (
        <span className={cn(BADGE, "bg-muted text-muted-foreground")}>Text only</span>
      )}
    </span>
  );
}
