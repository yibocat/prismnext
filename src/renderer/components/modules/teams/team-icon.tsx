// 统一的 pack 图标（浏览页 / 设置页 / 详情页共用）。
// 有 manifest.icon 时渲染 emoji / lucide / image；否则回退到通用 Package。
// Image icons live as `<teamDir>/icon.png` — resolved via fsReadImage.
import { IconRenderer } from "../shared/icon-renderer";
import { useIconImageSrc } from "../shared/use-icon-image-src";
import { normalizeIconSpec, type IconSpec } from "@shared/icon-spec";

export function PackIcon({
  size = "md",
  icon,
  iconDir,
}: {
  size?: "sm" | "md" | "lg";
  /** Team manifest icon; accepts a legacy string (treated as emoji). */
  icon?: IconSpec | string | null;
  /** Absolute team directory (needed to resolve image icons). */
  iconDir?: string | null;
}) {
  const spec = normalizeIconSpec(icon);
  const imageSrc = useIconImageSrc(spec, iconDir);
  return (
    <IconRenderer
      spec={spec}
      size={size}
      fallback="package"
      imageSrc={imageSrc}
    />
  );
}
