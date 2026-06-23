import { useState } from "react";
import { GlobeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function getFaviconUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return null;
    return `${u.protocol}//${u.hostname}/favicon.ico`;
  } catch {
    return null;
  }
}

export function BrowserFavicon({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url);

  if (failed || !src) {
    return <GlobeIcon className={cn("size-3 shrink-0 text-muted-foreground/40", className)} />;
  }

  return (
    <img
      src={src}
      alt=""
      className={cn("size-3 shrink-0", className)}
      onError={() => setFailed(true)}
    />
  );
}
