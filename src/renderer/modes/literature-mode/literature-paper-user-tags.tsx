import { useCallback, useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { useLiteratureStore } from "@/stores/literature-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  literatureDetailBadgeAddClass,
  literatureDetailBadgeClass,
} from "./literature-list-chrome";
import { collectProjectTags, collectTagSuggestions } from "@/lib/literature/paper-tag-utils";
import {
  normalizePaperTagsWithCatalog,
  paperTagKey,
  resolvePaperTagDisplay,
  paperTagToneClass,
} from "../../../shared/paper-tags";
import { LiteratureTagSuggestInput } from "./literature-tag-suggest-input";
import { cn } from "@/lib/utils";

const userTagShellClass = cn(
  literatureDetailBadgeClass,
  "group/tag gap-1 border bg-transparent pr-1",
);

export function LiteraturePaperUserTags({
  paperId,
  tags,
  disabled = false,
}: {
  paperId: string;
  tags: string[];
  disabled?: boolean;
}) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const papers = useLiteratureStore((s) => s.papers);
  const updatePaper = useLiteratureStore((s) => s.updatePaper);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const projectTagList = useMemo(
    () => collectProjectTags(papers).map((e) => e.tag),
    [papers],
  );

  const suggestions = useMemo(
    () => collectTagSuggestions(papers, tags),
    [papers, tags],
  );

  const persistTags = useCallback(
    async (next: string[]) => {
      if (!projectRoot || saving) return;
      setSaving(true);
      try {
        await updatePaper(
          projectRoot,
          paperId,
          { tags: normalizePaperTagsWithCatalog(next, projectTagList) },
          { silent: true },
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update tags");
      } finally {
        setSaving(false);
      }
    },
    [paperId, projectRoot, projectTagList, saving, updatePaper],
  );

  const addTag = useCallback(
    async (raw: string) => {
      const tag = resolvePaperTagDisplay(raw, projectTagList);
      if (!tag) {
        if (raw.trim()) toast.error("Invalid tag");
        setDraft("");
        setAdding(false);
        return;
      }
      if (tags.some((t) => paperTagKey(t) === paperTagKey(tag))) {
        setDraft("");
        setAdding(false);
        return;
      }
      await persistTags([...tags, tag]);
      setDraft("");
      setAdding(false);
    },
    [persistTags, projectTagList, tags],
  );

  const removeTag = useCallback(
    async (tag: string) => {
      await persistTags(tags.filter((t) => t !== tag));
    },
    [persistTags, tags],
  );

  const startAdding = () => {
    if (disabled) return;
    setAdding(true);
  };

  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(userTagShellClass, paperTagToneClass(tag))}
          title={tag}
        >
          <span className="max-w-[10rem] truncate">{tag}</span>
          {!disabled ? (
            <button
              type="button"
              className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-muted hover:opacity-100 group-hover/tag:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove tag ${tag}`}
              disabled={saving}
              onClick={() => void removeTag(tag)}
            >
              <XIcon className="size-2.5" />
            </button>
          ) : null}
        </span>
      ))}

      {adding ? (
        <LiteratureTagSuggestInput
          value={draft}
          onChange={setDraft}
          onCommit={(tag) => void addTag(tag)}
          onCancel={() => {
            setDraft("");
            setAdding(false);
          }}
          suggestions={suggestions}
          disabled={disabled || saving}
          autoFocus
        />
      ) : !disabled ? (
        <button
          type="button"
          className={literatureDetailBadgeAddClass}
          disabled={saving}
          onClick={startAdding}
        >
          + Tag
        </button>
      ) : null}
    </>
  );
}
