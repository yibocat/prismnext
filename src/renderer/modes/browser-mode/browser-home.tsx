import { useBrowserStore } from "@/stores/browser-store";
import { navigateBrowserUrl, openUrlInBrowser } from "@/lib/browser-link";
import { BrowserFavicon } from "./browser-favicon";

interface BrowserHomeProps {
  tabId: string;
}

export function BrowserHome({ tabId }: BrowserHomeProps) {
  const recentVisits = useBrowserStore((s) => s.recentVisits);
  const recent = recentVisits.slice(0, 8);

  const handleOpen = (url: string) => {
    navigateBrowserUrl(tabId, url);
  };

  if (recent.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          Enter a URL or search term above
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
      <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
        Enter a URL or search term above
      </p>
      <div className="w-full max-w-md space-y-1">
        <p className="text-[length:var(--font-hint)] text-muted-foreground text-center">
          Recent
        </p>
        {recent.map((visit, i) => (
          <button
            key={`${visit.url}-${i}`}
            type="button"
            className="flex w-full items-center gap-2 truncate rounded px-2 py-1.5 text-left text-[length:var(--font-size-12)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={visit.url}
            onClick={() => handleOpen(visit.url)}
          >
            <BrowserFavicon url={visit.url} />
            <span className="truncate flex-1">{visit.title || visit.url}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
