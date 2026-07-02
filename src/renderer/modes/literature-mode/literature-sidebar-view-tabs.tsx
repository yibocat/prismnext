import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type LiteratureReaderSidebarView = "notes" | "marks" | "references" | "citedBy";

const tabTriggerClass = cn(
  "h-6 px-0 text-[length:var(--font-size-11)] font-medium",
  "bg-transparent shadow-none rounded-none",
  "text-muted-foreground/60",
  "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
  "hover:text-foreground transition-colors",
);

function countSuffix(count: number | undefined): string {
  if (count == null || count <= 0) return "";
  if (count >= 10_000) return ` ${Math.round(count / 1000)}k`;
  if (count >= 1_000) return ` ${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return ` ${count}`;
}

/** Notes / Marks / Refs / Cited by — text tabs matching Git sidebar header. */
export function LiteratureSidebarViewTabs({
  value,
  onValueChange,
  referenceCount,
  citedByCount,
}: {
  value: LiteratureReaderSidebarView;
  onValueChange: (view: LiteratureReaderSidebarView) => void;
  referenceCount?: number;
  citedByCount?: number;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as LiteratureReaderSidebarView)}
      className="min-w-0 shrink gap-0"
    >
      <TabsList className="h-7 min-w-0 gap-3 p-0 bg-transparent border-0 shadow-none">
        <TabsTrigger value="notes" className={tabTriggerClass}>
          Notes
        </TabsTrigger>
        <TabsTrigger value="marks" className={tabTriggerClass}>
          Marks
        </TabsTrigger>
        <TabsTrigger value="references" className={tabTriggerClass}>
          Refs{countSuffix(referenceCount)}
        </TabsTrigger>
        <TabsTrigger value="citedBy" className={tabTriggerClass}>
          Cited by{countSuffix(citedByCount)}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
