// src/renderer/components/modules/chat/agent-settings/thought-level-select.tsx
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useSettingsStore } from "@/stores/settings-store";
import { getThoughtLevels } from "@/lib/providers";
import { ChevronDownIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";

export function ThoughtLevelSelect() {
  const aiProvider = useSettingsStore((s) => s.settings.aiProvider) || "anthropic";
  const thoughtLevel = useSettingsStore((s) => s.settings.thoughtLevel);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const levels = getThoughtLevels(aiProvider);
  const current = levels.find((l) => l.value === thoughtLevel);

  return (
    <AppMenu>
      <Hint label="Reasoning depth">
        <AppMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span>{current?.label || "Default"}</span>
            <ChevronDownIcon className="size-3" />
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="start" className="min-w-[9rem]">
        <AppMenuLabel>Reasoning Depth</AppMenuLabel>
        <AppMenuCheckItem
          selected={!thoughtLevel}
          onClick={() => updateSettings({ thoughtLevel: undefined })}
        >
          Default
        </AppMenuCheckItem>
        {levels.map((l) => (
          <AppMenuCheckItem
            key={l.value}
            selected={thoughtLevel === l.value}
            onClick={() => updateSettings({ thoughtLevel: l.value })}
          >
            {l.label}
          </AppMenuCheckItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
