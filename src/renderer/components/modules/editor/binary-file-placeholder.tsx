import { useTranslation } from "react-i18next";
import { FileWarningIcon, FolderOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTabContext } from "@/lib/workspace/tab-context";
import { tabFileId, tabFilePath } from "@/lib/workspace/mode-registry";
import { projectPathBasename } from "@/lib/files/mentionable-files";
import { revealProjectRelativePath } from "@/lib/files/reveal-project-path";

export function BinaryFilePlaceholder() {
  const { t } = useTranslation();
  const { tab } = useTabContext();
  const filePath = tabFilePath(tab) ?? tabFileId(tab) ?? "";
  const name = projectPathBasename(filePath) || filePath;

  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileWarningIcon className="size-6" aria-hidden />
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-[length:var(--font-size-14)] font-medium text-foreground">
          {t("modes.files.binaryCannotOpenTitle")}
        </p>
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("modes.files.binaryCannotOpenBody", { name })}
        </p>
      </div>
      {filePath ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => revealProjectRelativePath(filePath)}
        >
          <FolderOpenIcon className="size-3.5" aria-hidden />
          {t("modes.files.revealInSystem")}
        </Button>
      ) : null}
    </div>
  );
}
