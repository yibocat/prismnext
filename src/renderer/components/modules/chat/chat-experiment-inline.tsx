import { memo, useMemo } from "react";
import { FlaskConicalIcon } from "lucide-react";
import { openComposerExperimentToken } from "@/lib/chat/inline-token-open";
import { useExperimentStore } from "@/stores/experiment-store";
import { InlineTokenChip } from "./inline-tokens/inline-token-chip";

function shortExperimentLabel(id: string, title?: string | null): string {
  if (title?.trim()) return title.trim();
  const parts = id.split("-");
  if (parts.length >= 3) {
    return parts.slice(2, -1).join("-") || parts[parts.length - 1] || id;
  }
  return id;
}

export const ChatExperimentInline = memo(function ChatExperimentInline({
  experimentId,
}: {
  experimentId: string;
}) {
  const title = useExperimentStore((s) => {
    const exp = s.experiments.find((e) => e.id === experimentId);
    return exp?.title ?? null;
  });
  const label = useMemo(
    () => shortExperimentLabel(experimentId, title),
    [experimentId, title],
  );

  return (
    <InlineTokenChip
      variant="code"
      icon={<FlaskConicalIcon className="size-[0.85em] shrink-0" />}
      label={label}
      title={title ? `${title} (${experimentId})` : experimentId}
      onClick={() => openComposerExperimentToken(experimentId)}
    />
  );
});
