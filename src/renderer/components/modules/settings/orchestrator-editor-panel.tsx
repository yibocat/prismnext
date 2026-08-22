import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { closeSettingsPanel } from "@/stores/settings-panel-store";
import type {
  SubagentInfo,
  OrchestratorInfo,
  SaveCustomOrchestratorPayload,
} from "@shared/agent/subagents";
import { FALLBACK_ORCHESTRATOR_FQID } from "@shared/teams/types";
import { buildSubagentRosterMarkdown } from "@shared/agent/subagent-roster";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";
import { SETTINGS_DETAIL_SHELL, SETTINGS_ROW_DESC } from "./settings-tokens";
import {
  ProfileEditorForm,
  CollapsibleFormSection,
  emptyProfileForm,
  parseProfileModel,
  type ProfileFormState,
} from "./profile-editor-form";
import { SettingsModulePromptPreview } from "./settings-module-prompt-preview";

type AgentOrchestratorSlot = Extract<SettingsPanelSlot, { kind: "agent-orchestrator" }>;

const AUTOSAVE_MS = 400;

function formFromOrchestrator(
  detail: OrchestratorInfo & { instructions: string },
): ProfileFormState {
  const { providerId, modelId } = parseProfileModel(detail.model);
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    instructions: detail.instructions,
    modelProvider: providerId,
    modelId,
    thoughtLevel: detail.thoughtLevel ?? "",
  };
}

function isSafetyNetLeadFqid(fqid: string | null | undefined): boolean {
  // My Content Chat: fully locked. Project hangar lead: undeletable but editable.
  return Boolean(fqid && fqid === FALLBACK_ORCHESTRATOR_FQID);
}

function persistSnapshot(input: {
  form: ProfileFormState;
  roster: string[];
  rosterMode: "all" | "list";
  targetTeamId: string | null;
}): string {
  return JSON.stringify({
    id: input.form.id,
    name: input.form.name,
    description: input.form.description,
    instructions: input.form.instructions,
    roster: input.roster,
    rosterMode: input.rosterMode,
    targetTeamId: input.targetTeamId,
  });
}

export function OrchestratorEditorPanel({ slot }: { slot: AgentOrchestratorSlot }) {
  const { t } = useTranslation();
  const closePanel = closeSettingsPanel;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const builtinCustomize = slot.mode === "installed";
  const isNew = slot.mode === "new";
  const orchestratorId = slot.mode === "new" ? undefined : slot.orchestratorId;

  const [loading, setLoading] = useState(!isNew);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [safetyNet, setSafetyNet] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(emptyProfileForm());
  const [roster, setAllowedExperts] = useState<string[]>([]);
  const [rosterMode, setRosterMode] = useState<"all" | "list">("list");
  const [experts, setExperts] = useState<SubagentInfo[]>([]);
  const [contentFqid, setContentFqid] = useState<string | null>(null);
  const [targetTeamId, setTargetPackId] = useState<string | null>(null);
  const lastSavedRef = useRef<string>("");
  const persistInFlightRef = useRef(false);
  const pendingSnapRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const rosterRef = useRef(roster);
  const rosterModeRef = useRef(rosterMode);
  const targetTeamIdRef = useRef(targetTeamId);
  formRef.current = form;
  rosterRef.current = roster;
  rosterModeRef.current = rosterMode;
  targetTeamIdRef.current = targetTeamId;

  const readOnlyProfile = builtinCustomize || safetyNet;
  const allowAutosave = !builtinCustomize && !safetyNet && !isNew;

  useEffect(() => {
    if (isNew) {
      toast.message(t("settings.editor.orchestrator.createViaTeam"));
      closePanel();
    }
  }, [isNew, closePanel, t]);

  useEffect(() => {
    if (!projectRoot) {
      setForm(emptyProfileForm());
      setAllowedExperts([]);
      setRosterMode("list");
      setContentFqid(null);
      setSafetyNet(false);
      setLoading(false);
      setReady(false);
      return;
    }
    if (isNew) return;

    let cancelled = false;

    async function load() {
      const root = projectRoot;
      if (!root) return;
      setLoading(true);
      setReady(false);
      try {
        const expertList = await window.electronAPI.subagentsList(root);
        if (cancelled) return;
        setExperts(expertList.filter((e) => e.enabled));

        const enabledExpertIds = expertList.filter((e) => e.enabled).map((e) => e.id);
        const pruneAllowed = (ids: string[] | undefined) =>
          (ids ?? []).filter((id) => enabledExpertIds.includes(id));

        const applyDetail = (detail: OrchestratorInfo & { instructions: string }) => {
          const mode = detail.rosterMode === "all" ? "all" : "list";
          setRosterMode(mode);
          setAllowedExperts(mode === "list" ? pruneAllowed(detail.roster) : []);
          setContentFqid(detail.fqid ?? null);
          setSafetyNet(isSafetyNetLeadFqid(detail.fqid));
        };

        const detail = await window.electronAPI.orchestratorsGetDetail(root, orchestratorId!);
        if (cancelled) return;
        if (!detail) {
          toast.error(t("settings.editor.orchestrator.toast.notFound"));
          closePanel();
          return;
        }
        setForm(formFromOrchestrator(detail));
        applyDetail(detail);
        // Keep owning team (incl. project.local). Null falls back to Common Team
        // in saveCustomOrchestrator — which refuses lead edits.
        const pid = detail.fqid?.split(":")[0];
        setTargetPackId(pid || null);
      } catch {
        if (!cancelled) {
          toast.error(t("settings.editor.orchestrator.toast.loadFailed"));
          closePanel();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectRoot, isNew, orchestratorId, slot.mode, closePanel, t]);

  useEffect(() => {
    if (loading || isNew) {
      setReady(false);
      return;
    }
    lastSavedRef.current = persistSnapshot({
      form,
      roster,
      rosterMode,
      targetTeamId,
    });
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional hydrate gate
  }, [loading, isNew]);

  const persistOrchestrator = useCallback(
    async (snap: string) => {
      if (!projectRoot || !allowAutosave) return;
      if (persistInFlightRef.current) {
        pendingSnapRef.current = snap;
        return;
      }

      const currentForm = formRef.current;
      const currentRoster = rosterRef.current;
      const currentRosterMode = rosterModeRef.current;
      const currentTarget = targetTeamIdRef.current;

      if (!currentForm.name.trim() || !currentForm.instructions.trim()) return;

      persistInFlightRef.current = true;
      setSaving(true);
      try {
        const allowedExpertsField = currentRosterMode === "all" ? undefined : currentRoster;
        const payload: SaveCustomOrchestratorPayload = {
          id: currentForm.id,
          name: currentForm.name.trim(),
          description: currentForm.description.trim(),
          instructions: currentForm.instructions,
          roster: allowedExpertsField,
          rosterMode: currentRosterMode,
        };
        const result = await window.electronAPI.orchestratorsSaveCustom(
          projectRoot,
          payload,
          currentTarget ?? undefined,
        );
        const saved = result.orchestrator;
        if (saved?.id && saved.id !== currentForm.id) {
          setForm((prev) => ({ ...prev, id: saved.id }));
        }
        if (saved?.fqid) setContentFqid(saved.fqid);
        setSafetyNet(isSafetyNetLeadFqid(saved?.fqid));
        lastSavedRef.current = persistSnapshot({
          form: { ...currentForm, id: saved?.id || currentForm.id },
          roster: currentRoster,
          rosterMode: currentRosterMode,
          targetTeamId: currentTarget,
        });
      } catch (err: unknown) {
        toast.error(
          err instanceof Error ? err.message : t("settings.editor.orchestrator.toast.saveFailed"),
        );
      } finally {
        persistInFlightRef.current = false;
        setSaving(false);
        const pending = pendingSnapRef.current;
        pendingSnapRef.current = null;
        if (pending && pending !== lastSavedRef.current) {
          void persistOrchestrator(pending);
        }
      }
    },
    [projectRoot, allowAutosave, t],
  );

  useEffect(() => {
    if (!allowAutosave || !ready || loading || !projectRoot) return;
    const snap = persistSnapshot({
      form,
      roster,
      rosterMode,
      targetTeamId,
    });
    if (snap === lastSavedRef.current) return;
    if (!form.name.trim() || !form.instructions.trim()) return;

    const timer = window.setTimeout(() => {
      void persistOrchestrator(snap);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [
    allowAutosave,
    ready,
    loading,
    projectRoot,
    form,
    roster,
    rosterMode,
    targetTeamId,
    persistOrchestrator,
  ]);

  const subagentRosterMarkdown = useMemo(() => {
    const ids =
      rosterMode === "all"
        ? experts.map((e) => e.id)
        : roster.filter((id) => experts.some((e) => e.id === id));
    const refs = ids.map((id) => {
      const expert = experts.find((e) => e.id === id)!;
      return { id: expert.id, name: expert.name, description: expert.description };
    });
    return buildSubagentRosterMarkdown(refs);
  }, [roster, rosterMode, experts]);

  if (!projectRoot) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-13)] text-muted-foreground">
          {t("settings.editor.orchestrator.openProject")}
        </p>
      </div>
    );
  }

  if (isNew || loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 py-8">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className={SETTINGS_DETAIL_SHELL}>
        <p className={SETTINGS_ROW_DESC}>
          {safetyNet
            ? t("settings.editor.orchestrator.introSafetyNet")
            : builtinCustomize
              ? t("settings.editor.orchestrator.introBuiltin")
              : t("settings.editor.orchestrator.introEdit")}
        </p>

        <ProfileEditorForm
          form={form}
          onFormChange={setForm}
          builtinCustomize={readOnlyProfile}
          saving={saving}
          showModel={false}
        />

        <CollapsibleFormSection
          title={t("settings.editor.orchestrator.subagentRoster")}
          framed={false}
          defaultOpen
        >
          <p className={cn(SETTINGS_ROW_DESC, "mb-3")}>
            {t("settings.editor.orchestrator.rosterManagedInTeamDetail")}
          </p>
          <SettingsModulePromptPreview content={subagentRosterMarkdown} />
        </CollapsibleFormSection>
      </div>
    </div>
  );
}
