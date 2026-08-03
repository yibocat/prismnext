import { useTranslation } from "react-i18next";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NOTICE =
  "rounded-md border border-border bg-muted/40 px-3 py-2.5 flex gap-2 text-[length:var(--font-size-12)] text-muted-foreground";

/** Read-only banner for product-kernel prompt internals (stack / modules / tools). */
export function PromptInternalsNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn(NOTICE, className)} role="note">
      <InfoIcon className="size-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
      <p>{t("settings.prompts.internalsNotice")}</p>
    </div>
  );
}
