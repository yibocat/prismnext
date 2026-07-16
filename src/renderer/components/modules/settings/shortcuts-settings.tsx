import { Kbd } from "@/components/ui/kbd";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ShortcutGroup {
  titleKey: string;
  items: ShortcutItem[];
}

/** Matches what is wired in code today — not aspirational docs. */
type ShortcutStatus = "implemented" | "placeholder" | "planned";

interface ShortcutItem {
  keys: string[];
  descKey: string;
  status: ShortcutStatus;
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    titleKey: "settings.shortcuts.groups.global",
    items: [
      { keys: ["⌘", "W"], descKey: "settings.shortcuts.items.closeTab", status: "implemented" },
      { keys: ["⌘", "K"], descKey: "settings.shortcuts.items.commandPalette", status: "placeholder" },
      { keys: ["⌘", "B"], descKey: "settings.shortcuts.items.toggleSidebar", status: "planned" },
      { keys: ["⌘", "N"], descKey: "settings.shortcuts.items.newAgent", status: "planned" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groups.rightPanel",
    items: [
      { keys: ["⌘", "Tab"], descKey: "settings.shortcuts.items.nextWorkspaceTab", status: "implemented" },
      { keys: ["⌘", "⇧", "Tab"], descKey: "settings.shortcuts.items.prevWorkspaceTab", status: "implemented" },
      { keys: ["⌘", "R"], descKey: "settings.shortcuts.items.gitRefresh", status: "implemented" },
      { keys: ["⌘", "L"], descKey: "settings.shortcuts.items.insertToChat", status: "implemented" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groups.editor",
    items: [
      { keys: ["⌘", "S"], descKey: "settings.shortcuts.items.saveFile", status: "implemented" },
      { keys: ["⌘", "↵"], descKey: "settings.shortcuts.items.compile", status: "planned" },
      { keys: ["⌘", "F"], descKey: "settings.shortcuts.items.searchFile", status: "planned" },
      { keys: ["⌘", "B"], descKey: "settings.shortcuts.items.bold", status: "planned" },
      { keys: ["⌘", "I"], descKey: "settings.shortcuts.items.italic", status: "planned" },
      { keys: ["⌘", "/"], descKey: "settings.shortcuts.items.comment", status: "planned" },
      { keys: ["Esc"], descKey: "settings.shortcuts.items.closeSearch", status: "planned" },
      { keys: ["⌘", "⇧", "F"], descKey: "settings.shortcuts.items.synctex", status: "planned" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groups.chat",
    items: [
      { keys: ["⌘", "T"], descKey: "settings.shortcuts.items.newChat", status: "planned" },
      { keys: ["↵"], descKey: "settings.shortcuts.items.send", status: "implemented" },
      { keys: ["⇧", "↵"], descKey: "settings.shortcuts.items.newline", status: "implemented" },
      { keys: ["⌃", "Tab"], descKey: "settings.shortcuts.items.nextChat", status: "planned" },
      { keys: ["⌃", "⇧", "Tab"], descKey: "settings.shortcuts.items.prevChat", status: "planned" },
    ],
  },
  {
    titleKey: "settings.shortcuts.groups.changes",
    items: [
      { keys: ["⌘", "Y"], descKey: "settings.shortcuts.items.acceptChange", status: "implemented" },
      { keys: ["⌘", "N"], descKey: "settings.shortcuts.items.rejectChange", status: "implemented" },
      { keys: ["⌘", "⇧", "Y"], descKey: "settings.shortcuts.items.acceptAll", status: "planned" },
      { keys: ["⌘", "⇧", "N"], descKey: "settings.shortcuts.items.rejectAll", status: "planned" },
    ],
  },
];

const STATUS_STYLE: Record<ShortcutStatus, { labelKey: string; className: string }> = {
  implemented: { labelKey: "settings.shortcuts.status.active", className: "text-success" },
  placeholder: { labelKey: "settings.shortcuts.status.placed", className: "text-info" },
  planned: { labelKey: "settings.shortcuts.status.planned", className: "text-muted-foreground/50" },
};

function ShortcutRow({ item }: { item: ShortcutItem }) {
  const { t } = useTranslation();
  const s = STATUS_STYLE[item.status];
  return (
    <div className="flex items-center justify-between py-2.5 gap-4">
      <span className="text-[length:var(--font-size-13)] text-foreground min-w-0">
        {t(item.descKey)}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center gap-0.5">
          {item.keys.map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </span>
        <span className={cn(s.className, "text-[length:var(--font-size-10)] font-medium tabular-nums w-14 text-right")}>
          {t(s.labelKey)}
        </span>
      </div>
    </div>
  );
}

export function ShortcutsSettings() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.shortcuts.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.shortcuts.subtitle")}
          </p>
        </div>

        {SHORTCUTS.map((group) => (
          <div key={group.titleKey}>
            <h3 className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
              {t(group.titleKey)}
            </h3>
            <div className={cn("rounded-lg border border-border px-4 divide-y divide-border")}>
              {group.items.map((item) => (
                <ShortcutRow key={item.descKey} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
