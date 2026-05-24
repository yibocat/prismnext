import { GlobeIcon } from "lucide-react";

export function BrowserPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <GlobeIcon className="size-10 opacity-30" />
      <p className="text-[length:var(--font-placeholder)]">Browser will appear here</p>
      <p className="text-[length:var(--font-placeholder)] opacity-50">Coming soon</p>
    </div>
  );
}
