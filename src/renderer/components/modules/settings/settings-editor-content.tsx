import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontalIcon } from "lucide-react";
import type { RightTab } from "@/lib/workspace/mode-registry";
import {
  type SettingsPanelSlot,
} from "@/lib/settings/settings-panel-slots";
import { WorkspaceFolderEditor } from "./workspace-folder-editor";
import { ProviderEditorPanel } from "./provider-editor-panel";
import { ExpertEditorPanel } from "./expert-editor-panel";
import { OrchestratorEditorPanel } from "./orchestrator-editor-panel";
import { PromptMarkdownPanel } from "./prompt-markdown-panel";
import { PromptStackPreviewPanel } from "./prompt-stack-preview-panel";
import { RuleMarkdownPanel } from "./rule-markdown-panel";
import { CustomCommandEditorPanel } from "./custom-command-editor-panel";
import { McpJsonEditorPanel } from "./mcp-json-editor-panel";
import { McpCatalogPanel } from "./mcp-catalog-panel";
import { McpPasteJsonPanel } from "./mcp-paste-json-panel";
import { McpServerEditorPanel } from "./mcp-server-editor-panel";
import { SkillMarkdownPanel } from "./skill-markdown-panel";
import { SkillLibraryPanel } from "./skill-library-panel";
import { AgentToolsPanel } from "./agent-tools-panel";
import { KnowledgeModulesPanel } from "./knowledge-modules-panel";
import { BuiltinCommandsPanel } from "./builtin-commands-panel";
import { ResearchBriefPanel } from "./research-brief-panel";
import { ShortcutsSettings } from "./shortcuts-settings";
import { LogViewer } from "./log-viewer";

function PlaceholderSlot({ slot }: { slot: Extract<SettingsPanelSlot, { kind: "placeholder" }> }) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-6">
      <p className="text-[length:var(--font-size-13)] text-muted-foreground leading-relaxed">
        {slot.description ?? t("settings.panels.empty.placeholderReserved")}
      </p>
    </div>
  );
}

export function renderSettingsPanelSlot(slot: SettingsPanelSlot): ReactNode {
  switch (slot.kind) {
    case "placeholder":
      return <PlaceholderSlot slot={slot} />;
    case "workspace-folder":
      return <WorkspaceFolderEditor slot={slot} />;
    case "ai-provider":
      return <ProviderEditorPanel slot={slot} />;
    case "agent-expert":
      return <ExpertEditorPanel slot={slot} />;
    case "agent-orchestrator":
      return <OrchestratorEditorPanel slot={slot} />;
    case "prompt-markdown":
      return <PromptMarkdownPanel slot={slot} />;
    case "prompt-stack-preview":
      return <PromptStackPreviewPanel />;
    case "research-brief":
      return <ResearchBriefPanel />;
    case "rule-markdown":
      return <RuleMarkdownPanel slot={slot} />;
    case "custom-command":
      return <CustomCommandEditorPanel slot={slot} />;
    case "mcp-json":
      return <McpJsonEditorPanel />;
    case "mcp-catalog":
      return <McpCatalogPanel />;
    case "mcp-paste-json":
      return <McpPasteJsonPanel />;
    case "mcp-server":
      return <McpServerEditorPanel slot={slot} />;
    case "skill-markdown":
      return <SkillMarkdownPanel slot={slot} />;
    case "skill-library":
      return <SkillLibraryPanel />;
    case "agent-tools":
      return <AgentToolsPanel />;
    case "knowledge-modules":
      return <KnowledgeModulesPanel />;
    case "builtin-commands":
      return <BuiltinCommandsPanel />;
    case "shortcuts":
      return <ShortcutsSettings />;
    case "logs":
      return <LogViewer />;
  }
}

export function settingsSlotBodyClassName(slot: SettingsPanelSlot): string {
  if (
    slot.kind === "prompt-markdown" ||
    slot.kind === "prompt-stack-preview" ||
    slot.kind === "mcp-json" ||
    slot.kind === "skill-markdown" ||
    slot.kind === "rule-markdown" ||
    slot.kind === "logs"
  ) {
    return "flex-1 min-h-0 w-full overflow-hidden";
  }
  return "flex-1 min-h-0 w-full overflow-auto";
}

/** Unified RightArea tab content for settings editors. */
export function SettingsEditorContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const { t } = useTranslation();
  const slot = tab.settingsSlot;
  if (!slot) {
    return (
      <div className="flex flex-1 items-center justify-center text-[length:var(--font-size-12)] text-muted-foreground">
        {t("settings.panels.empty.missingPayload")}
      </div>
    );
  }

  // Unmount inactive editors so hidden RightArea tabs cannot bleed stale UI layers
  // (e.g. LogViewer list showing through an empty-state panel).
  if (!isActive) return null;

  return <div className={settingsSlotBodyClassName(slot)}>{renderSettingsPanelSlot(slot)}</div>;
}

export function SettingsEditorEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 min-h-0 w-full items-center justify-center overflow-auto px-6">
      <div className="max-w-[16rem] space-y-2 text-center">
        <SlidersHorizontalIcon className="mx-auto size-5 text-muted-foreground/40" />
        <p className="text-[length:var(--font-size-13)] font-medium text-foreground/80">
          {t("settings.panels.empty.noEditor")}
        </p>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground leading-relaxed">
          {t("settings.panels.empty.chooseAction")}
        </p>
      </div>
    </div>
  );
}
