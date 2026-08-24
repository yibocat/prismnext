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
  PICKER_LUCIDE_ICONS,
  type LucideIconName,
} from "@/lib/workspace/folder-icons";
import {
  SESSION_ICON_COLORS,
  type SessionIconColor,
} from "@shared/chat/session-chrome";
import {
  sessionIconColorClass,
  sessionIconSwatchClass,
} from "@/lib/chat/session-icon-registry";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import { ICON_IMAGE_FILENAME, isIconTint, type IconKind, type IconSpec } from "@shared/platform/icon-spec";
import { IconRenderer, type IconFallback } from "./icon-renderer";
import { useIconImageSrc } from "./use-icon-image-src";

/** Tight 8-column panel — session submenu and team popover must match this width. */
export const ICON_PICKER_PANEL_WIDTH_CLASS = "w-[17.5rem]";

const PICKER_EMOJIS = [...new Set([
  "📄", "📑", "📃", "🧾", "📰", "📜", "📝", "✏️", "🖊️", "✒️", "🖋️", "🖌️",
  "📌", "📍", "📎", "🖇️", "✂️", "📐", "📏", "🗒️", "📋", "🗓️", "📅", "📆",
  "📚", "📖", "📕", "📗", "📘", "📙", "📓", "📒", "📔", "🔖", "🏷️", "🗂️",
  "📁", "📂", "🗃️", "🗄️", "📦", "📫", "📬", "📭", "📮", "✉️", "📧", "📨",
  "📤", "📥", "🧪", "🔬", "🧬", "🔭", "🧠", "💡", "⚛️", "🧲", "🛰️", "🚀",
  "🧮", "📊", "📈", "📉", "💹", "🔢", "🔍", "🔎", "💻", "🖥️", "⌨️", "🖱️",
  "🖨️", "💾", "💿", "📀", "📡", "🔌", "🔋", "🪫", "🛠️", "⚙️", "🔧", "🔨",
  "🧰", "🔩", "⚗️", "⛏️", "🪚", "🪛", "🪜", "🎯", "✨", "⭐", "🌟", "💫",
  "💎", "🔮", "🪄", "🧩", "🎲", "♟️", "🃏", "🎴", "🀄", "🎮", "🕹️", "🎰",
  "💼", "🏫", "🏛️", "🎓", "🏅", "🏆", "🎖️", "🥇", "🥈", "🥉", "✅", "☑️",
  "✔️", "❌", "❗", "❓", "💬", "💭", "🗯️", "🔔", "🔕", "📣", "📢", "🔊",
  "⏰", "⏱️", "⏲️", "⏳", "⌛", "🧭", "🗺️", "🏠", "🏡", "🏢", "🏚️", "🏗️",
  "🌐", "🌍", "🌎", "🌏", "🌑", "🌒", "🌕", "🌙", "☀️", "⚡", "🔥", "❄️",
  "🌈", "☁️", "⛅", "🌧️", "⛈️", "🌨️", "💨", "🌀", "🌊", "🪐", "🌋", "🌌",
  "🌿", "🍀", "🌱", "🌲", "🌳", "🌴", "🌵", "🌸", "🌺", "🌻", "🌼", "🌷",
  "🍎", "🍋", "🍇", "🍓", "🍑", "🥑", "🌽", "🍞", "🧀", "☕", "🍵", "🧃",
  "🍕", "🍔", "🌮", "🍣", "🍜", "🍩", "🍪", "🎂", "🍫", "🍯", "🧋", "🍷",
  "🔗", "🔑", "🔐", "🔒", "🔓", "🛡️", "👁️", "👀", "👤", "👥", "🗣️", "👣",
  "🪙", "💳", "💵", "💴", "💶", "💷", "💰", "⚖️", "🪪", "📰", "📝", "📁",
  "🎵", "🎶", "🎧", "🎤", "🎼", "🎹", "📷", "📸", "📹", "🎥", "🎬", "📺",
  "📱", "☎️", "📞", "🔦", "🕯️", "🛋️", "🛏️", "🚪", "🪟", "🪞", "🛒", "🧰",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💞",
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
  "🐷", "🐸", "🐵", "🦄", "🐝", "🦋", "🐢", "🐙", "🦑", "🦀", "🐠", "🐳",
  "🐦", "🐧", "🦉", "🐺", "🐗", "🐴", "🦄", "🐞", "🐛", "🦗", "🦂", "🐍",
  "🚗", "🚕", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚚", "🚛", "🚜", "🚲",
  "✈️", "🛫", "🛬", "🛩️", "🚁", "🚂", "🚆", "🚇", "🚢", "⛵", "🛶", "🛸",
  "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓", "🏸", "🥊", "⛳", "🏹",
  "🎨", "🖼️", "🧵", "🧶", "🪡", "🧸", "🎁", "🎈", "🎉", "🎊", "🎀", "🥳",
  "😀", "😃", "😄", "😁", "😊", "😉", "😍", "🤩", "😎", "🤓", "🧐", "🤔",
  "🫡", "🤗", "😴", "🤯", "😈", "👻", "💀", "🤖", "👽", "🎃", "👑", "🎩",
  "👋", "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️", "🤞", "🤙", "👌",
  "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👂", "👃", "🫦", "👅", "🗣️", "👤",
  "💻", "🖥️", "🧮", "📡", "🛰️", "🚀", "🔭", "🔬", "🧪", "🧬", "⚗️", "🧲",
  "📌", "📎", "📏", "📐", "✂️", "🖊️", "✏️", "📝", "📁", "📂", "🗂️", "🗃️",
  "🏳️", "🏴", "🏁", "🚩", "🎌", "🇯🇵", "🇺🇸", "🇬🇧", "🇫🇷", "🇩🇪", "🇨🇳", "🇰🇷",
  "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔠", "🔢",
  "♻️", "⚠️", "🚫", "⛔", "✅", "❎", "➕", "➖", "➗", "✖️", "♾️", "💲",
])];

const DEFAULT_COLOR_SWATCHES: IconPickerColorSwatch[] = SESSION_ICON_COLORS.map((id) => ({
  id,
  className: sessionIconSwatchClass(id),
  title: id,
}));

export interface IconPickerColorSwatch {
  id: string;
  className: string;
  title?: string;
}

export interface IconPickerPanelProps {
  value: IconSpec | null;
  onChange: (spec: IconSpec | null) => void;
  kinds?: IconKind[];
  allowClear?: boolean;
  /** Close the parent surface after a pick. Default true. */
  closeOnPick?: boolean;
  onRequestClose?: () => void;
  imageBaseDir?: string | null;
  persistImage?: (pngBase64: string) => Promise<IconSpec>;
  onPendingImagePngBase64?: (pngBase64: string | null) => void;
  /** Lucide-only tint. Hidden on emoji / image tabs. */
  colorSwatches?: IconPickerColorSwatch[];
  selectedColor?: string;
  onColorChange?: (id: string) => void;
}

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
   * (team dir).
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

export function IconPickerPanel({
  value,
  onChange,
  kinds = ALL_KINDS,
  allowClear = true,
  closeOnPick = true,
  onRequestClose,
  imageBaseDir,
  persistImage,
  onPendingImagePngBase64,
  colorSwatches,
  selectedColor,
  onColorChange,
}: IconPickerPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<IconKind>(value?.kind ?? kinds[0] ?? "emoji");
  const [emojiInput, setEmojiInput] = useState("");
  const [iconQuery, setIconQuery] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valueColor = value?.kind === "lucide" && value.color ? value.color : "default";
  const [draftColor, setDraftColor] = useState<string>(selectedColor ?? valueColor);
  const lucideName = value?.kind === "lucide" ? value.value : "";

  const available = kinds.filter((k) => ALL_KINDS.includes(k));
  const effectiveTab: IconKind = available.includes(tab) ? tab : available[0] ?? "emoji";
  const imageSrc = useIconImageSrc(value, imageBaseDir ?? null, pendingPreview);
  const swatches = colorSwatches && colorSwatches.length > 0 ? colorSwatches : DEFAULT_COLOR_SWATCHES;
  const tint = (selectedColor ?? draftColor) as SessionIconColor;
  const visibleLucide = iconQuery.trim()
    ? PICKER_LUCIDE_ICONS.filter((name) => name.toLowerCase().includes(iconQuery.trim().toLowerCase()))
    : PICKER_LUCIDE_ICONS;

  useEffect(() => {
    if (value?.kind && available.includes(value.kind)) setTab(value.kind);
  }, [value?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedColor) {
      setDraftColor(selectedColor);
      return;
    }
    if (lucideName) setDraftColor(valueColor);
  }, [lucideName]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback(
    (spec: IconSpec | null, close: boolean) => {
      if (!spec || spec.kind !== "image") {
        setPendingPreview(null);
        onPendingImagePngBase64?.(null);
      }
      onChange(spec);
      if (close) onRequestClose?.();
    },
    [onChange, onPendingImagePngBase64, onRequestClose],
  );

  const finish = useCallback(
    (spec: IconSpec | null) => apply(spec, closeOnPick),
    [apply, closeOnPick],
  );

  const lucideSpec = (name: string, color = tint): IconSpec => {
    const next: IconSpec = { kind: "lucide", value: name };
    if (color && color !== "default" && isIconTint(color)) next.color = color;
    return next;
  };

  const pickTint = (id: string) => {
    setDraftColor(id);
    onColorChange?.(id);
    if (value?.kind === "lucide") {
      apply(lucideSpec(value.value, id as SessionIconColor), false);
    }
  };

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
          if (closeOnPick) onRequestClose?.();
        } else {
          setPendingPreview(preview);
          onPendingImagePngBase64?.(pngBase64);
          finish({ kind: "image", value: ICON_IMAGE_FILENAME });
        }
      } catch {
        setImageError(t("icon.picker.image.failed"));
      } finally {
        setImageBusy(false);
      }
    },
    [closeOnPick, finish, onChange, onPendingImagePngBase64, onRequestClose, persistImage, t],
  );

  return (
    <div className="w-full min-w-0">
      {available.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 pt-2">
          {available.map((k) => {
            const TabIcon = TAB_ICON[k];
            const activeTab = k === effectiveTab;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "flex items-center gap-1 rounded-sm px-1.5 py-1 text-[length:var(--font-size-12)] transition-colors",
                  activeTab
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <TabIcon className="size-3.5" />
                {t(`icon.picker.tab.${k}`)}
              </button>
            );
          })}
        </div>
      )}

      {effectiveTab === "lucide" ? (
        <div className="flex items-center px-1.5 py-1.5">
          {swatches.map((swatch) => {
            const selected = tint === swatch.id;
            return (
              <button
                key={swatch.id}
                type="button"
                title={swatch.title ?? swatch.id}
                aria-pressed={selected}
                className="flex h-6 flex-1 items-center justify-center"
                onClick={() => pickTint(swatch.id)}
              >
                <span
                  className={cn(
                    "size-3 rounded-full",
                    swatch.className,
                    selected && "outline outline-2 outline-offset-2 outline-ring",
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {effectiveTab === "emoji" && (
        <div>
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <input
              value={emojiInput}
              onChange={(e) => setEmojiInput(e.target.value)}
              maxLength={8}
              placeholder={t("icon.picker.emoji.paste")}
              className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-transparent px-1.5 text-[length:var(--font-size-12)] outline-none"
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <button
              type="button"
              disabled={!emojiInput.trim()}
              onClick={() => finish({ kind: "emoji", value: emojiInput.trim() })}
              className="rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              {t("common.ok")}
            </button>
          </div>
          <div className="grid max-h-[260px] w-full grid-cols-8 gap-0 overflow-y-auto overscroll-contain px-2 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
            {PICKER_EMOJIS.map((ic) => {
              const selected = value?.kind === "emoji" && value.value === ic;
              return (
                <button
                  key={ic}
                  type="button"
                  title={ic}
                  onClick={() => finish({ kind: "emoji", value: ic })}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-sm text-[length:var(--font-size-16)] leading-none transition-colors",
                    selected ? "bg-accent text-foreground" : "hover:bg-accent",
                  )}
                >
                  {ic}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {effectiveTab === "lucide" && (
        <div>
          <div className="px-2 py-1.5">
            <input
              value={iconQuery}
              onChange={(e) => setIconQuery(e.target.value)}
              placeholder={t("icon.picker.search", { defaultValue: "Search icons…" })}
              className="h-6 w-full rounded-sm border border-border bg-transparent px-1.5 text-[length:var(--font-size-12)] outline-none"
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
          <div className="grid max-h-[260px] w-full grid-cols-8 gap-0 overflow-y-auto overscroll-contain px-2 pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
            {visibleLucide.map((iconName: LucideIconName) => {
              const selected = value?.kind === "lucide" && value.value === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  title={iconName}
                  onClick={() => finish(lucideSpec(iconName))}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-sm transition-colors",
                    selected
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <WorkspaceFolderIcon
                    name={iconName}
                    className={cn("size-3.5", sessionIconColorClass(tint))}
                  />
                </button>
              );
            })}
          </div>
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
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-6 text-[length:var(--font-size-12)] text-muted-foreground",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
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
        <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => finish(null)}
            disabled={!value}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            <Trash2Icon className="size-3" />
            {t("icon.picker.clear")}
          </button>
          <button
            type="button"
            onClick={() => finish(null)}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <RotateCcwIcon className="size-3" />
            {t("icon.picker.default")}
          </button>
        </div>
      )}
    </div>
  );
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
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const imageSrc = useIconImageSrc(value, imageBaseDir, pendingPreview);

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
              "focus-visible:ring-2 focus-visible:ring-ring",
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
        className={cn(ICON_PICKER_PANEL_WIDTH_CLASS, "p-0", contentClassName)}
      >
        <IconPickerPanel
          value={value}
          onChange={onChange}
          kinds={kinds}
          allowClear={allowClear}
          closeOnPick
          onRequestClose={() => setOpen(false)}
          imageBaseDir={imageBaseDir}
          persistImage={persistImage}
          onPendingImagePngBase64={(pngBase64) => {
            setPendingPreview(pngBase64 ? `data:image/png;base64,${pngBase64}` : null);
            onPendingImagePngBase64?.(pngBase64);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
