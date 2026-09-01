import { useTranslation } from "react-i18next";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NOTICE =
  "rounded-md border border-border px-3 py-2.5 flex gap-2 text-[length:var(--font-size-12)] text-muted-foreground";

const NOTICE_KEY = {
  tools: "settings.prompts.internalsNotice",
  summary: "settings.prompts.internalsNoticeSummary",
  developer: "settings.prompts.internalsNoticeDeveloper",
} as const;

/** Read-only banner for product-kernel prompt internals (stack / modules / tools). */
export function PromptInternalsNotice({
  className,
  variant = "tools",
}: {
  className?: string;
  variant?: keyof typeof NOTICE_KEY;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn(NOTICE, className)} role="note">
      <InfoIcon className="size-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
      <p>{t(NOTICE_KEY[variant])}</p>
    </div>
  );
}
