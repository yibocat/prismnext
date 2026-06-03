import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";
import { ChevronDownIcon } from "lucide-react";
import { ClaudeSettingsContent, ClaudeSettingsLabel } from "./claude-settings";
import { GeminiSettingsContent, GeminiSettingsLabel } from "./gemini-settings";
import { OpenCodeSettingsContent, OpenCodeSettingsLabel } from "./opencode-settings";
import { QoderSettingsContent, QoderSettingsLabel } from "./qoder-settings";

interface AgentSettingsComponent {
  Content: React.ComponentType;
  Label: React.ComponentType;
}

const REGISTRY: Record<string, AgentSettingsComponent> = {
  claude: { Content: ClaudeSettingsContent, Label: ClaudeSettingsLabel },
  gemini: { Content: GeminiSettingsContent, Label: GeminiSettingsLabel },
  opencode: { Content: OpenCodeSettingsContent, Label: OpenCodeSettingsLabel },
  qoder: { Content: QoderSettingsContent, Label: QoderSettingsLabel },
};

export function AgentSettingsBar() {
  const selectedAgent = useChatStore((s) => s.selectedAgent);
  const entry = REGISTRY[selectedAgent] || REGISTRY.claude;
  const { Content, Label } = entry;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground text-[length:var(--font-chat-meta)] transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Label />
          <ChevronDownIcon className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <Content />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
