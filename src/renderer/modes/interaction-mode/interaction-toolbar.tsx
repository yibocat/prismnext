import { useTranslation } from "react-i18next";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { cn } from "@/lib/utils";

export function InteractionToolbar({ tab }: { tab: RightTab }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-w-0 flex-1 items-center px-3">
      <span className="truncate text-[length:var(--font-size-12)] font-medium text-foreground">
        {tab.title || t("modes.interaction.initialTitle")}
      </span>
    </div>
  );
}
