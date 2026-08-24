import { Kbd } from "@/components/ui/kbd";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  chordDisplayParts,
  detectShortcutPlatform,
  listShortcuts,
  type ShortcutCategory,
  type ShortcutDef,
} from "../../../../shared/shortcuts";
import { desktopPlatform } from "@/lib/desktop-api/shell";
import { resolveShortcut } from "@/lib/shortcuts";

const CATEGORY_ORDER: ShortcutCategory[] = ["shell", "editor", "workspace", "product"];

const CATEGORY_TITLE_KEY: Record<ShortcutCategory, string> = {
  shell: "settings.shortcuts.groups.global",
  editor: "settings.shortcuts.groups.editor",
  workspace: "settings.shortcuts.groups.rightPanel",
  product: "settings.shortcuts.groups.chat",
};

function ShortcutRow({ def }: { def: ShortcutDef }) {
  const { t } = useTranslation();
  const resolved = resolveShortcut(def.id);
  const platform = detectShortcutPlatform(desktopPlatform());
  const keys = resolved?.chord ? chordDisplayParts(resolved.chord, platform) : [];
  const fixed = !def.remappable;
  const active = def.implemented !== false;

  return (
    <div className="flex items-center justify-between py-2.5 gap-4">
      <span className="text-[length:var(--font-size-13)] text-foreground min-w-0">
        {t(def.labelKey)}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center gap-0.5">
          {keys.map((k, i) => (
            <Kbd key={`${def.id}-${i}`}>{k}</Kbd>
          ))}
        </span>
        <span
          className={cn(
            "text-[length:var(--font-size-10)] font-medium tabular-nums text-right min-w-14",
            fixed
              ? "text-muted-foreground/60"
              : active
                ? "text-success"
                : "text-muted-foreground/50",
          )}
        >
          {fixed
            ? t("settings.shortcuts.status.fixed")
            : active
              ? t("settings.shortcuts.status.active")
              : t("settings.shortcuts.status.planned")}
        </span>
      </div>
    </div>
  );
}

export function ShortcutsSettings() {
  const { t } = useTranslation();
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    titleKey: CATEGORY_TITLE_KEY[category],
    items: listShortcuts().filter((d) => d.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.shortcuts.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.shortcuts.subtitle")}
          </p>
        </div>

        {grouped.map((group) => (
          <div key={group.category}>
            <h3 className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
              {t(group.titleKey)}
            </h3>
            <div className={cn("rounded-lg border border-border px-4 divide-y divide-border")}>
              {group.items.map((item) => (
                <ShortcutRow key={item.id} def={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
