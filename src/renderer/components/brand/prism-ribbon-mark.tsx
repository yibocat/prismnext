import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import {
  BRAND_PALETTES,
  DEFAULT_BRAND_PALETTE,
  RIBBON_LOWER_D,
  RIBBON_MARK_SCALE,
  RIBBON_STROKE_WIDTH,
  RIBBON_UPPER_D,
  resolveBrandRibbonColors,
  resolveBrandRibbonShadow,
  resolveBrandSchemeFromTheme,
  type BrandPaletteId,
} from "../../../shared/brand-mark";

type PrismRibbonMarkProps = {
  className?: string;
  /** Named colorway; default Warm Graphite (p5). */
  palette?: BrandPaletteId;
  /** Force scheme; default follows app light/dark. */
  scheme?: "light" | "dark" | "auto";
  /** D2 offset shadow (default on). */
  shadow?: boolean;
  title?: string;
};

/**
 * prismnext ribbon mark — locked variant A (fork ribbon) + D2 shadow.
 */
export function PrismRibbonMark({
  className,
  palette = DEFAULT_BRAND_PALETTE,
  scheme = "auto",
  shadow = true,
  title = "prismnext",
}: PrismRibbonMarkProps) {
  const { resolvedTheme } = useTheme();
  // Surface-based: dark UI → cream/amber mark; light UI → graphite/amber.
  // Only treat explicit "dark" as dark (undefined must not fall into dark).
  const effective: "light" | "dark" =
    scheme === "auto" ? resolveBrandSchemeFromTheme(resolvedTheme) : scheme;
  const colors = resolveBrandRibbonColors(palette, effective);
  const drop = resolveBrandRibbonShadow(effective);

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <g transform={`translate(32 32) scale(${RIBBON_MARK_SCALE}) translate(-32 -32)`}>
        {shadow ? (
          <g
            transform={`translate(${drop.offsetX} ${drop.offsetY})`}
            opacity={drop.opacity}
          >
            <path
              d={RIBBON_LOWER_D}
              stroke={drop.color}
              strokeWidth={drop.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={RIBBON_UPPER_D}
              stroke={drop.color}
              strokeWidth={drop.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ) : null}
        <path
          d={RIBBON_LOWER_D}
          stroke={colors.secondary}
          strokeWidth={RIBBON_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={RIBBON_UPPER_D}
          stroke={colors.primary}
          strokeWidth={RIBBON_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export { BRAND_PALETTES, DEFAULT_BRAND_PALETTE };
export type { BrandPaletteId };
