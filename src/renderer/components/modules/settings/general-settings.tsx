import { useState } from "react";
import { ChevronRightIcon, InfoIcon } from "lucide-react";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { Switch } from "@/components/ui/switch";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const CARD = SETTINGS_CARD;
const CATEGORY_HEADER = SETTINGS_CATEGORY_HEADER;
const ROW_LABEL = SETTINGS_ROW_LABEL;
const ROW_DESC = SETTINGS_ROW_DESC;

const LANGUAGES = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

interface NotificationToggle {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

const NOTIFICATIONS: NotificationToggle[] = [
  {
    id: "conversation",
    label: "Conversation notifications",
    description: "Show system notifications when a conversation reply completes or needs your action.",
    defaultOn: true,
  },
  {
    id: "menu-bar",
    label: "Menu bar icon",
    description: "Show a shortcut icon in the macOS top menu bar for quick access to recent conversations.",
    defaultOn: true,
  },
];

function PanelRow({
  title,
  description,
  onOpen,
}: {
  title: string;
  description: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1 pr-4">
        <p className={ROW_LABEL}>{title}</p>
        <p className={ROW_DESC}>{description}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        Open
        <ChevronRightIcon className="size-3.5" />
      </button>
    </div>
  );
}

export function GeneralSettings() {
  const [language, setLanguage] = useState("zh-CN");
  const [notifState, setNotifState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.defaultOn])),
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        {/* ── Header ── */}
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">General</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Basic application settings.
          </p>
        </div>

        {/* ── Language ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Language</h3>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>AI reply language</p>
                <p className={ROW_DESC}>
                  Preferred language for AI replies — conversations, inline chat, commit messages, and memory.
                </p>
              </div>
              <AppSelect value={language} onValueChange={setLanguage}>
                <AppSelectTrigger className="w-32 shrink-0">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {LANGUAGES.map((l) => (
                    <AppSelectItem key={l.value} value={l.value}>
                      {l.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </div>

        {/* ── Notifications ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <h3 className={CATEGORY_HEADER + " !mb-0"}>Notifications</h3>
            <InfoIcon className="size-3 text-muted-foreground/50" />
          </div>
          <div className={CARD}>
            {NOTIFICATIONS.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1 pr-4">
                  <p className={ROW_LABEL}>{n.label}</p>
                  <p className={ROW_DESC}>{n.description}</p>
                </div>
                <Switch
                  checked={notifState[n.id] ?? false}
                  onCheckedChange={(v) => setNotifState((s) => ({ ...s, [n.id]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Shortcuts (opens right panel) ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Shortcuts</h3>
          <div className={CARD}>
            <PanelRow
              title="Keyboard shortcuts"
              description="Reference for global, editor, chat, and merge-view shortcuts."
              onOpen={() => openSettingsPanel({ kind: "shortcuts" })}
            />
          </div>
        </div>

        {/* ── Logs (opens right panel) ── */}
        <div>
          <h3 className={CATEGORY_HEADER}>Logs</h3>
          <div className={CARD}>
            <PanelRow
              title="Application logs"
              description="Browse, filter, search, and export main-process logs."
              onOpen={() => openSettingsPanel({ kind: "logs" })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
