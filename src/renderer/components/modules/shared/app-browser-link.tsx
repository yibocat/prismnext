import type { ReactNode } from "react";
import { InlineTokenChip } from "@/components/modules/chat/inline-tokens";
import { isBrowsableUrl, linkLabelForUrl, normalizeBrowserUrl, openUrlInBrowser } from "@/lib/browser-link";

interface AppBrowserLinkProps {
  href?: string;
  children: ReactNode;
  className?: string;
}

/** Markdown / settings — browsable URLs render as themed link token chips. */
export function AppBrowserLink({ href, children, className }: AppBrowserLinkProps) {
  if (!href) return <span className={className}>{children}</span>;

  const normalized = normalizeBrowserUrl(href);
  if (!isBrowsableUrl(normalized) && !/^https?:\/\//i.test(href) && !href.startsWith("www.")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  const label =
    typeof children === "string" && children.trim() && children !== href
      ? children.trim()
      : linkLabelForUrl(normalized);

  return (
    <InlineTokenChip
      variant="link"
      label={label}
      title={normalized}
      className={className}
      onClick={() => openUrlInBrowser(normalized)}
    />
  );
}
