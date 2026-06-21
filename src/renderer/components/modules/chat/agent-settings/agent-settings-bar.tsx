// src/renderer/components/modules/chat/agent-settings/agent-settings-bar.tsx
import { ModelSelect } from "./model-select";
import { ThoughtLevelSelect } from "./thought-level-select";

export function AgentSettingsBar() {
  return (
    <div className="flex items-center gap-0.5">
      <ModelSelect />
      <ThoughtLevelSelect />
    </div>
  );
}
