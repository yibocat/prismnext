import { useTranslation } from "react-i18next";
import { GlobeIcon } from "lucide-react";

export function BrowserPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <GlobeIcon className="size-10 opacity-30" />
      <p className="text-[length:var(--font-placeholder)]">{t("modes.browser.willAppearHere")}</p>
      <p className="text-[length:var(--font-placeholder)] opacity-50">{t("modes.browser.comingSoon")}</p>
    </div>
  );
}
