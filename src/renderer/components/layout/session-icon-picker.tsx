import { IconPickerPanel } from "@/components/modules/shared/icon-picker";
import { setSessionIconAction } from "@/lib/chat/session-context-actions";
import {
  resolveSessionIcon,
  sessionIconFromPickerSpec,
} from "@/lib/chat/session-icon-registry";
import { useSettingsStore } from "@/stores/settings-store";
import type { IconSpec } from "@shared/platform/icon-spec";

interface SessionIconPickerPanelProps {
  projectRoot: string;
  sessionId: string;
}

export function SessionIconPickerPanel({
  projectRoot,
  sessionId,
}: SessionIconPickerPanelProps) {
  const stored = useSettingsStore(
    (s) => s.settings.sessionChromeByProject?.[projectRoot]?.[sessionId]?.icon ?? null,
  );
  const resolved = resolveSessionIcon(stored);

  const value: IconSpec | null = resolved
    ? resolved.kind === "emoji"
      ? { kind: "emoji", value: resolved.value }
      : {
          kind: "lucide",
          value: resolved.value,
          ...(resolved.color !== "default" ? { color: resolved.color } : {}),
        }
    : null;

  return (
    <div
      className="w-full min-w-0"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <IconPickerPanel
        value={value}
        kinds={["emoji", "lucide"]}
        closeOnPick={false}
        onChange={(spec) => {
          void setSessionIconAction(projectRoot, sessionId, sessionIconFromPickerSpec(spec));
        }}
      />
    </div>
  );
}
