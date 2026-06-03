import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

type ShortcutStatus = "implemented" | "placeholder" | "planned";

interface ShortcutItem {
  keys: string[];
  description: string;
  status: ShortcutStatus;
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Global",
    items: [
      { keys: ["⌘", "B"], description: "Toggle left sidebar", status: "planned" },
      { keys: ["⌘", "K"], description: "Open command palette", status: "placeholder" },
      { keys: ["⌘", "N"], description: "New agent session", status: "placeholder" },
      { keys: ["⌘", "I"], description: "Open AI assistant", status: "placeholder" },
    ],
  },
  {
    title: "Editor",
    items: [
      { keys: ["⌘", "S"], description: "Save file", status: "implemented" },
      { keys: ["⌘", "↵"], description: "Compile current document", status: "planned" },
      { keys: ["⌘", "F"], description: "Search in file", status: "planned" },
      { keys: ["⌘", "B"], description: "Wrap selection in \\textbf{}", status: "planned" },
      { keys: ["⌘", "I"], description: "Wrap selection in \\textit{}", status: "planned" },
      { keys: ["⌘", "/"], description: "Toggle comment", status: "planned" },
      { keys: ["Esc"], description: "Close search panel", status: "planned" },
      { keys: ["⌘", "⇧", "F"], description: "Forward search (SyncTeX) to PDF", status: "planned" },
    ],
  },
  {
    title: "Chat",
    items: [
      { keys: ["⌘", "T"], description: "New chat tab", status: "planned" },
      { keys: ["⌘", "W"], description: "Close chat tab", status: "planned" },
      { keys: ["⌃", "Tab"], description: "Next chat tab", status: "planned" },
      { keys: ["⌃", "⇧", "Tab"], description: "Previous chat tab", status: "planned" },
      { keys: ["↵"], description: "Send message", status: "planned" },
    ],
  },
  {
    title: "Changes (Merge View)",
    items: [
      { keys: ["⌘", "Y"], description: "Accept all changes", status: "planned" },
      { keys: ["⌘", "N"], description: "Reject all changes", status: "planned" },
    ],
  },
];

const STATUS_STYLE: Record<ShortcutStatus, { label: string; className: string }> = {
  implemented: { label: "Active", className: "text-success" },
  placeholder: { label: "Placed", className: "text-info" },
  planned: { label: "Planned", className: "text-muted-foreground/50" },
};

function ShortcutRow({ item }: { item: ShortcutItem }) {
  const s = STATUS_STYLE[item.status];
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[length:var(--font-size-13)] text-foreground">
        {item.description}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center gap-0.5">
          {item.keys.map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </span>
        <span className={s.className + " text-[length:var(--font-size-10)] font-medium tabular-nums w-14 text-right"}>
          {s.label}
        </span>
      </div>
    </div>
  );
}

export function ShortcutsSettings() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Shortcuts</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Keyboard shortcuts reference.
          </p>
        </div>

        {SHORTCUTS.map((group) => (
          <div key={group.title}>
            <h3 className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
              {group.title}
            </h3>
            <div className={cn(
              "rounded-lg border border-border px-4 divide-y divide-border",
            )}>
              {group.items.map((item) => (
                <ShortcutRow key={item.description} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
