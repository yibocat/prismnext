import {
  AlignLeftIcon,
  ListIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_ICONS: Record<string, LucideIcon> = {
  name: TagIcon,
  description: AlignLeftIcon,
  license: ListIcon,
};

const SKILL_FIELD_ORDER = ["name", "description", "license"];

export function MarkdownFrontmatterCard({
  fields,
  rawFrontmatter,
  variant = "default",
  className,
}: {
  fields: Record<string, string>;
  rawFrontmatter?: string;
  variant?: "default" | "skill";
  className?: string;
}) {
  const entries = Object.entries(fields);
  if (entries.length === 0 && !rawFrontmatter?.trim()) return null;

  const orderedEntries =
    variant === "skill" ? orderSkillFields(entries) : entries;

  return (
    <section className={cn("mb-5 pb-5 border-b border-border/50", className)}>
      <h3 className="text-[length:var(--font-size-13)] font-medium text-foreground mb-1">
        Properties
      </h3>

      {orderedEntries.length > 0 ? (
        <div>
          {orderedEntries.map(([key, value]) => (
            <FrontmatterRow key={key} keyName={key} value={value} />
          ))}
        </div>
      ) : rawFrontmatter?.trim() ? (
        <pre className="mt-2 text-[length:var(--font-size-12)] font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
          {rawFrontmatter.trim()}
        </pre>
      ) : null}
    </section>
  );
}

function orderSkillFields(entries: [string, string][]): [string, string][] {
  const map = new Map(entries);
  const result: [string, string][] = [];
  for (const key of SKILL_FIELD_ORDER) {
    const value = map.get(key);
    if (value !== undefined) result.push([key, value]);
    map.delete(key);
  }
  for (const [key, value] of map.entries()) {
    result.push([key, value]);
  }
  return result;
}

function FrontmatterRow({ keyName, value }: { keyName: string; value: string }) {
  const Icon = FIELD_ICONS[keyName] ?? AlignLeftIcon;

  return (
    <div className="flex items-start gap-3 py-1.5 min-h-8">
      <div className="flex items-center gap-1.5 w-[7.5rem] shrink-0 pt-0.5">
        <Icon className="size-3.5 text-muted-foreground/70 shrink-0" strokeWidth={1.75} />
        <span className="text-[length:var(--font-size-12)] text-muted-foreground truncate">
          {keyName}
        </span>
      </div>
      <p
        className={cn(
          "flex-1 min-w-0 text-[length:var(--font-size-13)] leading-relaxed text-foreground/90",
          keyName === "name" && "font-mono text-[length:var(--font-size-12)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}
