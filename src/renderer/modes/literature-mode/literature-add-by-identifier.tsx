import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, Wand2Icon } from "lucide-react";
import { toast } from "sonner";
import { useLiteratureStore } from "@/stores/literature-store";
import { parseCatalogIdentifier } from "../../../shared/parse-catalog-identifier";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appPopoverFontClass, appPopoverListClass } from "@/components/ui/app-popover";
import { Input } from "@/components/ui/input";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const triggerClass = cn(
  "flex size-6 shrink-0 items-center justify-center rounded text-[length:var(--font-menu-item)]",
  "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
);

const identifierInputClass = cn(
  "h-6 px-2 py-0 shadow-none",
  "text-[length:var(--font-size-11)] md:text-[length:var(--font-size-11)]",
  "placeholder:text-muted-foreground/70",
);

/** Zotero-style “magic wand” — add by catalog identifier without blocking the library view. */
export function LiteratureAddByIdentifierButton({
  projectRoot,
  disabled,
}: {
  projectRoot: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const addByIdentifier = useLiteratureStore((s) => s.addByIdentifier);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!projectRoot || busy) return;
    const parsed = parseCatalogIdentifier(value);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const { ok: _ok, ...ids } = parsed;
    setBusy(true);
    try {
      await addByIdentifier(projectRoot, ids);
      setValue("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add entry");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={t("modes.literature.addByIdentifier")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={triggerClass}
            disabled={!projectRoot || disabled}
          >
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <Wand2Icon className="size-3.5" />
            )}
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          appPopoverListClass,
          appPopoverFontClass,
          "w-[min(19rem,var(--radix-popover-content-available-width))] p-2",
        )}
      >
        <p className="text-[length:var(--font-size-11)] leading-snug text-muted-foreground">
          DOI, arXiv, ISBN, PMID, or ADS bibcode — paste a URL or bare ID.
        </p>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="10.1145/… · 2401.12345 · ISBN…"
          className={cn(identifierInputClass, "mt-1.5")}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
