// src/renderer/components/modules/chat/agent-settings/thought-level-select.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/stores/settings-store";
import { getThoughtLevels } from "@/lib/providers";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

export function ThoughtLevelSelect() {
  const aiProvider = useSettingsStore((s) => s.settings.aiProvider) || "anthropic";
  const thoughtLevel = useSettingsStore((s) => s.settings.thoughtLevel);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const levels = getThoughtLevels(aiProvider);
  const current = levels.find((l) => l.value === thoughtLevel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Reasoning depth"
        >
          <span>{current?.label || "Default"}</span>
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Reasoning Depth
        </div>
        <DropdownMenuItem
          onClick={() => updateSettings({ thoughtLevel: undefined })}
        >
          <span className="flex-1 text-[length:var(--font-chat-meta)]">Default</span>
          {!thoughtLevel && <CheckIcon className="size-3 shrink-0" />}
        </DropdownMenuItem>
        {levels.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => updateSettings({ thoughtLevel: l.value })}
          >
            <span className="flex-1 text-[length:var(--font-chat-meta)]">{l.label}</span>
            {thoughtLevel === l.value && <CheckIcon className="size-3 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
