// Settings → Teams — create a custom (non-store) team in the right panel.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentStore } from "@/stores/document-store";
import { useTeamsStore } from "@/stores/teams-store";
import { closeSettingsPanel, openSettingsPanel } from "@/stores/settings-panel-store";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { IconPicker } from "../shared/icon-picker";
import type { IconSpec } from "@shared/icon-spec";
import {
  SETTINGS_DETAIL_ACTIONS,
  SETTINGS_DETAIL_SECTION,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_FORM_INPUT,
  SETTINGS_FORM_TEXTAREA,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { SettingsFormField } from "./settings-form-field";
import { CollapsibleFormSection } from "./profile-editor-form";

type TeamCreateSlot = Extract<SettingsPanelSlot, { kind: "team-create" }>;

function parseTags(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function TeamCreatePanel({ slot }: { slot: TeamCreateSlot }) {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconSpec | null>(null);
  const [pendingIconPngBase64, setPendingIconPngBase64] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [scope, setScope] = useState<"app" | "project">(slot.scope ?? "project");
  const [leadName, setLeadName] = useState("");
  const [leadInstructions, setLeadInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (slot.scope) setScope(slot.scope);
  }, [slot.scope]);

  const canCreate = useMemo(
    () => Boolean(projectRoot && name.trim() && !saving),
    [projectRoot, name, saving],
  );

  const create = async () => {
    if (!projectRoot || !name.trim()) return;
    setSaving(true);
    try {
      const { teamId } = await window.electronAPI.teamsCreate(projectRoot, {
        name: name.trim(),
        description: description.trim() || undefined,
        longDescription: longDescription.trim() || undefined,
        tags: parseTags(tagsRaw),
        scope,
        leadName: leadName.trim() || undefined,
        leadInstructions: leadInstructions.trim() || undefined,
        icon: icon?.kind === "image" ? undefined : icon,
        iconImagePngBase64: pendingIconPngBase64 ?? undefined,
      });
      await useTeamsStore.getState().load(projectRoot, { force: true });
      toast.success(t("settings.teams.toast.teamCreated"));
      openSettingsPanel({
        kind: "team-detail",
        teamId,
        title: name.trim(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.teams.noProject")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.teamCreate.intro")}</p>

        <div className={SETTINGS_DETAIL_SECTION}>
          <SettingsFormField
            label={t("settings.editor.teamCreate.icon")}
            description={t("settings.editor.teamCreate.iconDesc")}
          >
            <IconPicker
              value={icon}
              onChange={setIcon}
              onPendingImagePngBase64={setPendingIconPngBase64}
              name={name.trim() || t("settings.editor.teamCreate.namePlaceholder")}
              fallback="letter"
              size="md"
              triggerLabel={t("icon.picker.choose")}
            />
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.teamCreate.name")}
            htmlFor="team-create-name"
            description={t("settings.editor.teamCreate.nameDesc")}
          >
            <Input
              id="team-create-name"
              className={SETTINGS_FORM_INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.editor.teamCreate.namePlaceholder")}
              autoFocus
            />
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.teamCreate.scope")}
            description={t("settings.editor.teamCreate.scopeDesc")}
          >
            <div className="flex gap-1">
              <Button
                type="button"
                size="xs"
                variant={scope === "project" ? "secondary" : "ghost"}
                onClick={() => setScope("project")}
                disabled={saving}
              >
                {t("settings.teams.scope.project")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant={scope === "app" ? "secondary" : "ghost"}
                onClick={() => setScope("app")}
                disabled={saving}
              >
                {t("settings.teams.scope.app")}
              </Button>
            </div>
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.teamCreate.description")}
            htmlFor="team-create-desc"
          >
            <Input
              id="team-create-desc"
              className={SETTINGS_FORM_INPUT}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("settings.editor.teamCreate.descriptionPlaceholder")}
            />
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.teamCreate.longDescription")}
            htmlFor="team-create-long"
            description={t("settings.editor.teamCreate.longDescriptionDesc")}
          >
            <Textarea
              id="team-create-long"
              className={SETTINGS_FORM_TEXTAREA}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder={t("settings.editor.teamCreate.longDescriptionPlaceholder")}
            />
          </SettingsFormField>

          <SettingsFormField
            label={t("settings.editor.teamCreate.tags")}
            htmlFor="team-create-tags"
            description={t("settings.editor.teamCreate.tagsDesc")}
          >
            <Input
              id="team-create-tags"
              className={SETTINGS_FORM_INPUT}
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder={t("settings.editor.teamCreate.tagsPlaceholder")}
            />
          </SettingsFormField>
        </div>

        <CollapsibleFormSection
          title={t("settings.editor.teamCreate.leadSection")}
          framed={false}
          defaultOpen
        >
          <div className={cn(SETTINGS_DETAIL_SECTION, "!pt-0")}>
            <SettingsFormField
              label={t("settings.editor.teamCreate.leadName")}
              htmlFor="team-create-lead-name"
              description={t("settings.editor.teamCreate.leadNameDesc")}
            >
              <Input
                id="team-create-lead-name"
                className={SETTINGS_FORM_INPUT}
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder={name.trim() || t("settings.editor.teamCreate.leadNamePlaceholder")}
              />
            </SettingsFormField>

            <SettingsFormField
              label={t("settings.editor.teamCreate.leadInstructions")}
              htmlFor="team-create-lead-instructions"
              description={t("settings.editor.teamCreate.leadInstructionsDesc")}
            >
              <Textarea
                id="team-create-lead-instructions"
                className={cn(SETTINGS_FORM_TEXTAREA, "min-h-[10rem]")}
                value={leadInstructions}
                onChange={(e) => setLeadInstructions(e.target.value)}
                placeholder={t("settings.editor.teamCreate.leadInstructionsPlaceholder")}
              />
            </SettingsFormField>
          </div>
        </CollapsibleFormSection>

        <div className={SETTINGS_DETAIL_ACTIONS}>
          <Button size="xs" onClick={() => void create()} disabled={!canCreate}>
            {saving ? <Loader2Icon className="size-3 animate-spin mr-1" /> : null}
            {t("settings.editor.teamCreate.create")}
          </Button>
          <Button variant="ghost" size="xs" onClick={() => closeSettingsPanel()} disabled={saving}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
