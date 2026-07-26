/**
 * Literature-style experiment tags — chips with remove + "+ Tag" add.
 */
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  literatureDetailBadgeAddClass,
  literatureDetailBadgeClass,
} from "@/modes/literature-mode/literature-list-chrome";
import { cn } from "@/lib/utils";
import { useExperimentStore } from "@/stores/experiment-store";
import { useExperimentProjectRoot } from "./experiments-project-root";

const tagShellClass = cn(
  literatureDetailBadgeClass,
  "group/tag gap-1 border bg-transparent pr-1",
);

export function ExperimentsTags({
  experimentId,
  tags,
  disabled = false,
}: {
  experimentId: string;
  tags: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const projectRoot = useExperimentProjectRoot();
  const updateExperiment = useExperimentStore((s) => s.updateExperiment);
  const experiments = useExperimentStore((s) => s.experiments);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const seen = new Set(tags.map((x) => x.toLowerCase()));
    const out: string[] = [];
    for (const exp of experiments) {
      for (const tag of exp.tags ?? []) {
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
      }
    }
    return out.slice(0, 12);
  }, [experiments, tags]);

  const persistTags = useCallback(
    async (next: string[]) => {
      if (!projectRoot || saving) return;
      setSaving(true);
      try {
        const ok = await updateExperiment(projectRoot, experimentId, { tags: next });
        if (!ok) {
          const err = useExperimentStore.getState().error;
          toast.error(err || t("experiments.edit.failed"));
        }
      } finally {
        setSaving(false);
      }
    },
    [experimentId, projectRoot, saving, t, updateExperiment],
  );

  const addTag = useCallback(
    async (raw: string) => {
      const tag = raw.trim();
      if (!tag) {
        setDraft("");
        setAdding(false);
        return;
      }
      if (tags.some((x) => x.toLowerCase() === tag.toLowerCase())) {
        setDraft("");
        setAdding(false);
        return;
      }
      await persistTags([...tags, tag]);
      setDraft("");
      setAdding(false);
    },
    [persistTags, tags],
  );

  const removeTag = useCallback(
    async (tag: string) => {
      await persistTags(tags.filter((x) => x !== tag));
    },
    [persistTags, tags],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className={tagShellClass} title={tag}>
          <span className="max-w-[10rem] truncate">{tag}</span>
          {!disabled ? (
            <button
              type="button"
              className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-muted hover:opacity-100 group-hover/tag:opacity-100 focus-visible:opacity-100"
              aria-label={t("experiments.tags.remove", { tag, defaultValue: `Remove tag ${tag}` })}
              disabled={saving}
              onClick={() => void removeTag(tag)}
            >
              <XIcon className="size-2.5" />
            </button>
          ) : null}
        </span>
      ))}

      {adding ? (
        <Input
          autoFocus
          value={draft}
          disabled={disabled || saving}
          className="h-6 w-28 px-1.5 text-[length:var(--font-size-11)]"
          placeholder={t("experiments.tags.placeholder", { defaultValue: "tag…" })}
          list={`exp-tag-suggest-${experimentId}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (!draft.trim()) {
              setAdding(false);
              return;
            }
            void addTag(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addTag(draft);
            } else if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
        />
      ) : !disabled ? (
        <button
          type="button"
          className={literatureDetailBadgeAddClass}
          disabled={saving}
          onClick={() => setAdding(true)}
        >
          {t("experiments.tags.add", { defaultValue: "+ Tag" })}
        </button>
      ) : null}

      {suggestions.length > 0 ? (
        <datalist id={`exp-tag-suggest-${experimentId}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
