// Shared Pro tier chip — outline Badge, same size everywhere (Settings list / detail).
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ProBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("h-4.5 px-1 text-[length:var(--font-size-10)] shrink-0", className)}
    >
      Pro
    </Badge>
  );
}
