import { cn } from "@/lib/utils";

interface CircularProgressProps {
  /** 0–100 percentage */
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * SVG circular progress ring. Useful for compact indicators
 * like context-window usage or token budget consumption.
 */
export function CircularProgress({
  value,
  size = 18,
  strokeWidth = 2,
  className,
}: CircularProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className={cn("shrink-0 -rotate-90", className)}
      viewBox={`0 0 ${size} ${size}`}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20"
      />
      {/* Foreground ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={cn(
          "transition-all duration-500",
          clamped > 90 ? "text-destructive" : "text-muted-foreground/60",
        )}
      />
    </svg>
  );
}
