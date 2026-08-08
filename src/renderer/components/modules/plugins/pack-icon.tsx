// 统一的 pack 图标（浏览页 / 设置页共用）——中性主题色，不用彩色渐变：
// 与应用图标语言一致（lucide + muted 底色块），manifest.icon 未来接入时
// 在此一处替换即可。
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

export function PackIcon({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-border bg-muted",
        size === "lg" ? "size-10" : size === "sm" ? "size-7" : "size-8",
      )}
    >
      <Package
        className={cn(
          "text-muted-foreground",
          size === "lg" ? "size-4.5" : size === "sm" ? "size-3.5" : "size-4",
        )}
      />
    </div>
  );
}
