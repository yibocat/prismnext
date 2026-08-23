import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2Icon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkbenchStore } from "@/stores/workbench-store";
import {
  SETTINGS_FORM_FIELD,
  SETTINGS_FORM_INPUT,
  SETTINGS_ROW_LABEL,
} from "@/components/modules/settings/settings-tokens";
import {
  loadEditProjectDraft,
  saveEditProject,
} from "@/lib/workspace/edit-project";

interface EditProjectDialogProps {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EditProjectDialog({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: EditProjectDialogProps) {
  const member = useWorkbenchStore((s) =>
    projectId ? s.members.find((item) => item.id === projectId) ?? null : null,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md gap-0 overflow-hidden p-0 sm:rounded-xl">
        {member ? (
          <EditProjectPane
            key={member.id}
            projectId={member.id}
            lastPath={member.lastPath}
            displayName={member.displayName}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved?.();
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditProjectPane({
  projectId,
  lastPath,
  displayName,
  onCancel,
  onSaved,
}: {
  projectId: string;
  lastPath: string;
  displayName: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(displayName);
  const [folderExists, setFolderExists] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadEditProjectDraft(lastPath).then((draft) => {
      if (cancelled) return;
      setFolderExists(draft.folderExists);
    });
    return () => {
      cancelled = true;
    };
  }, [lastPath]);

  const trimmed = name.trim();
  const canSave = Boolean(trimmed) && !saving;

  const handleSave = async () => {
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveEditProject({
        projectId,
        displayName: trimmed,
      });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("project.edit.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="space-y-1 border-b border-border px-6 pt-5 pb-4">
        <h2 className="text-[length:var(--font-size-15)] font-semibold tracking-tight">
          {t("project.edit.title")}
        </h2>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("project.edit.description")}
        </p>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className={SETTINGS_FORM_FIELD}>
          <label className={SETTINGS_ROW_LABEL}>{t("project.new.projectName")}</label>
          <Input
            className={cn(SETTINGS_FORM_INPUT, "h-9 min-w-0 font-medium")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) void handleSave();
            }}
          />
          <p className="text-[length:var(--font-size-11)] text-muted-foreground">
            {t("project.edit.nameHint")}
          </p>
          {!folderExists ? (
            <p className="text-[length:var(--font-size-11)] font-medium text-destructive">
              {t("nav.workbench.missingFolder")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={() => void handleSave()}
          className="gap-1.5"
        >
          {saving ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            <>
              <CheckIcon className="size-3.5" />
              {t("project.edit.save")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
