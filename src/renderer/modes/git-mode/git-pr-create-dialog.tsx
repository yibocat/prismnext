import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGitStore } from "@/stores/git-store";

export function GitPrCreateDialog({ projectRoot }: { projectRoot: string }) {
  const { t } = useTranslation();
  const open = useGitStore((s) => s.pendingCreatePr);
  const defaults = useGitStore((s) => s.createPrDefaults);
  const creating = useGitStore((s) => s.creatingPr);
  const [title, setTitle] = useState("");
  const [base, setBase] = useState("");
  const [head, setHead] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  useEffect(() => {
    if (!open || !defaults) return;
    setTitle(defaults.title);
    setBase(defaults.base);
    setHead(defaults.head);
    setBody("");
    setDraft(false);
  }, [open, defaults]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useGitStore.getState().cancelCreatePr();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("git.prCreate.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-pr-title">{t("git.prCreate.titleField")}</Label>
            <Input
              id="git-pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-pr-base">{t("git.prCreate.base")}</Label>
              <Input
                id="git-pr-base"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="git-pr-head">{t("git.prCreate.head")}</Label>
              <Input id="git-pr-head" value={head} disabled />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="git-pr-body">{t("git.prCreate.body")}</Label>
            <Textarea
              id="git-pr-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("git.prCreate.bodyHint")}
              disabled={creating}
              rows={4}
            />
          </div>
          <label className="flex items-center gap-2 text-[length:var(--font-menu-item)]">
            <Checkbox
              checked={draft}
              onCheckedChange={(value) => setDraft(value === true)}
              disabled={creating}
            />
            {t("git.prCreate.draft")}
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => useGitStore.getState().cancelCreatePr()}
              disabled={creating}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={creating || !title.trim() || !base.trim() || !head.trim()}
              onClick={() => {
                void useGitStore.getState().createPullRequest(projectRoot, {
                  title,
                  base,
                  head,
                  body,
                  draft,
                });
              }}
            >
              {creating ? t("git.prCreate.creating") : t("git.prCreate.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
