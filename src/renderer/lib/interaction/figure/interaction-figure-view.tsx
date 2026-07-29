import { useTranslation } from "react-i18next";
import { ChatProjectImage } from "@/lib/markdown/extract-markdown-images";
import { SETTINGS_ROW_DESC } from "@/components/modules/settings/settings-tokens";
import { pickFigureResourcePath } from "../../../../shared/interaction-figure";
import type { InteractionSpec } from "../../../../shared/interaction-spec";

export function InteractionFigureView({ spec }: { spec: InteractionSpec }) {
  const { t } = useTranslation();
  const relPath = pickFigureResourcePath(spec);

  if (!relPath) {
    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center px-6 text-center">
        <p className={SETTINGS_ROW_DESC}>{t("interaction.panel.figureMissingPath")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 p-4 @md:px-5 @md:py-4">
        <div className="flex h-full min-h-0 overflow-hidden rounded-md border border-border bg-card p-3 @md:p-4">
          <ChatProjectImage src={relPath} alt={spec.title} variant="panel" />
        </div>
      </div>
      <p className="shrink-0 border-t border-border px-4 py-2.5 font-mono text-[length:var(--font-size-10)] text-muted-foreground">
        {relPath}
      </p>
    </div>
  );
}
