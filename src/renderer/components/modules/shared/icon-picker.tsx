import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon, RotateCcwIcon, Shapes, Smile, Trash2Icon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import {
  FOLDER_ICON_CATEGORIES,
  type LucideIconName,
} from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import { PROJECT_ICON_CATEGORIES } from "@/components/modules/project/project-icon";
import { ICON_IMAGE_FILENAME, type IconKind, type IconSpec } from "@shared/icon-spec";
import { IconRenderer, type IconFallback } from "./icon-renderer";
import { useIconImageSrc } from "./use-icon-image-src";

export interface IconPickerProps {
  value: IconSpec | null;
  onChange: (spec: IconSpec | null) => void;
  disabled?: boolean;
  /** Which kinds are selectable. Default: all three. */
  kinds?: IconKind[];
  /** Name used for the `letter` fallback avatar in the trigger. */
  name?: string;
  fallback?: IconFallback;
  size?: "sm" | "md" | "lg";
  triggerClassName?: string;
  contentClassName?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  /** Show a "clear / use default" footer action. Default true. */
  allowClear?: boolean;
  /** Accessible label for the trigger button. */
  triggerLabel?: string;
  /**
   * Directory that holds `icon.png` for an existing image icon
   * (team dir, or `<project>/.workbench`).
   */
  imageBaseDir?: string | null;
  /**
   * Persist a resized PNG immediately (edit flows). Return the stored IconSpec.
   * When omitted, the picker keeps PNG base64 in memory and reports it via
   * `onPendingImagePngBase64` for the parent to write on create.
   */
  persistImage?: (pngBase64: string) => Promise<IconSpec>;
  /** Pending image bytes for create-before-dir flows (cleared when emoji/lucide/null). */
  onPendingImagePngBase64?: (pngBase64: string | null) => void;
}

const ALL_KINDS: IconKind[] = ["emoji", "lucide", "image"];

const TAB_ICON: Record<IconKind, typeof Smile> = {
  emoji: Smile,
  lucide: Shapes,
  image: ImageIcon,
};

/** Resize an image File to a small PNG and return raw base64 (no data: prefix). */
async function fileToPngBase64(file: File, max = 128): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const dataUrl = canvas.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function IconPicker({
  value,
  onChange,
  disabled,
  kinds = ALL_KINDS,
  name,
  fallback = "package",
  size = "md",
  triggerClassName,
  contentClassName,
  side = "bottom",
  align = "start",
  allowClear = true,
  triggerLabel,
  imageBaseDir,
  persistImage,
  onPendingImagePngBase64,
}: IconPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<IconKind>(value?.kind ?? kinds[0] ?? "emoji");
  const [emojiInput, setEmojiInput] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const available = kinds.filter((k) => ALL_KINDS.includes(k));
  const effectiveTab: IconKind = available.includes(tab) ? tab : available[0] ?? "emoji";
  const imageSrc = useIconImageSrc(value, imageBaseDir, pendingPreview);

  // Keep the active tab in sync when the value's kind changes externally.
  useEffect(() => {
    if (value?.kind && available.includes(value.kind)) setTab(value.kind);
  }, [value?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = useCallback(
    (spec: IconSpec | null) => {
      if (!spec || spec.kind !== "image") {
        setPendingPreview(null);
        onPendingImagePngBase64?.(null);
      }
      onChange(spec);
      setOpen(false);
    },
    [onChange, onPendingImagePngBase64],
  );

  const onPickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setImageError(t("icon.picker.image.badType"));
        return;
      }
      setImageBusy(true);
      setImageError(null);
      try {
        const pngBase64 = await fileToPngBase64(file);
        const preview = `data:image/png;base64,${pngBase64}`;
        if (persistImage) {
          const stored = await persistImage(pngBase64);
          setPendingPreview(null);
          onPendingImagePngBase64?.(null);
          onChange(stored);
          setOpen(false);
        } else {
          setPendingPreview(preview);
          onPendingImagePngBase64?.(pngBase64);
          onChange({ kind: "image", value: ICON_IMAGE_FILENAME });
          setOpen(false);
        }
      } catch {
        setImageError(t("icon.picker.image.failed"));
      } finally {
        setImageBusy(false);
      }
    },
    [onChange, onPendingImagePngBase64, persistImage, t],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={triggerLabel ?? t("icon.picker.choose")} side="top">
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={triggerLabel ?? t("icon.picker.choose")}
            className={cn(
              "rounded-md outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-primary/40",
              "disabled:pointer-events-none disabled:opacity-50",
              "hover:opacity-80",
              triggerClassName,
            )}
          >
            <IconRenderer
              spec={value}
              size={size}
              name={name}
              fallback={fallback}
              imageSrc={imageSrc}
            />
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        side={side}
        align={align}
        className={cn("w-[340px] p-0", contentClassName)}
      >
        {available.length > 1 && (
          <div className="flex items-center gap-1 border-b border-border/50 px-2 py-1.5">
            {available.map((k) => {
              const TabIcon = TAB_ICON[k];
              const activeTab = k === effectiveTab;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-sm px-2 py-1 text-[length:var(--font-size-12)] transition-colors",
                    activeTab
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                  )}
                >
                  <TabIcon className="size-3.5" />
                  {t(`icon.picker.tab.${k}`)}
                </button>
              );
            })}
          </div>
        )}

        {effectiveTab === "emoji" && (
          <div>
            <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
              <input
                value={emojiInput}
                onChange={(e) => setEmojiInput(e.target.value)}
                maxLength={8}
                placeholder={t("icon.picker.emoji.paste")}
                className="h-7 min-w-0 flex-1 rounded-sm border border-border/60 bg-transparent px-2 text-[length:var(--font-size-12)] outline-none focus:border-primary/50"
              />
              <button
                type="button"
                disabled={!emojiInput.trim()}
                onClick={() => pick({ kind: "emoji", value: emojiInput.trim() })}
                className="rounded-sm px-2 py-1 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
              >
                {t("common.ok")}
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto overscroll-contain">
              {PROJECT_ICON_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <div className="sticky top-0 z-10 border-b border-border/50 bg-popover px-3 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground">
                    {cat.label}
                  </div>
                  <div className="grid grid-cols-8 gap-px px-1.5 py-1.5">
                    {cat.icons.map((ic) => {
                      const selected = value?.kind === "emoji" && value.value === ic;
                      return (
                        <button
                          key={ic}
                          type="button"
                          title={ic}
                          onClick={() => pick({ kind: "emoji", value: ic })}
                          className={cn(
                            "flex h-8 items-center justify-center rounded-sm text-[length:var(--font-size-16)] leading-none transition-colors",
                            selected
                              ? "bg-primary/15 ring-1 ring-primary/30"
                              : "hover:bg-accent",
                          )}
                        >
                          {ic}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {effectiveTab === "lucide" && (
          <div className="max-h-[340px] overflow-y-auto overscroll-contain">
            {FOLDER_ICON_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="sticky top-0 z-10 border-b border-border/50 bg-popover px-3 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground">
                  {cat.label}
                </div>
                <div className="grid grid-cols-8 gap-px px-1.5 py-1.5">
                  {cat.icons.map((iconName: LucideIconName) => {
                    const selected = value?.kind === "lucide" && value.value === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        title={iconName}
                        onClick={() => pick({ kind: "lucide", value: iconName })}
                        className={cn(
                          "flex h-8 items-center justify-center rounded-sm transition-colors",
                          selected
                            ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <WorkspaceFolderIcon name={iconName} className="size-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {effectiveTab === "image" && (
          <div className="p-3">
            {value?.kind === "image" && imageSrc ? (
              <div className="flex items-center gap-3">
                <img
                  src={imageSrc}
                  alt=""
                  className="size-12 rounded-md border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                    {t("icon.picker.image.current")}
                  </p>
                  <p className="mt-0.5 font-mono text-[length:var(--font-size-11)] text-muted-foreground/70">
                    {value.value}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageBusy}
                    className="mt-1 rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {t("icon.picker.image.replace")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageBusy}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border/70 px-3 py-6 text-[length:var(--font-size-12)] text-muted-foreground",
                  "hover:bg-accent/40 hover:text-accent-foreground transition-colors",
                  "disabled:opacity-50",
                )}
              >
                <ImageIcon className="size-5" />
                {imageBusy ? t("common.loading") : t("icon.picker.image.drop")}
              </button>
            )}
            {imageError && (
              <p className="mt-2 text-[length:var(--font-size-11)] text-destructive">
                {imageError}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
          </div>
        )}

        {allowClear && (
          <div className="flex items-center justify-between border-t border-border/50 px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => pick(null)}
              disabled={!value}
              className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              <Trash2Icon className="size-3" />
              {t("icon.picker.clear")}
            </button>
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <RotateCcwIcon className="size-3" />
              {t("icon.picker.default")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
