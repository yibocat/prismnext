import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  GlobeIcon,
  GraduationCapIcon,
  BookOpenIcon,
  SearchIcon,
  LinkIcon,
} from "lucide-react";

interface Bookmark {
  label: string;
  url: string;
  icon: React.ReactNode;
}

const BOOKMARKS: Bookmark[] = [
  { label: "Google Scholar", url: "https://scholar.google.com", icon: <GraduationCapIcon className="size-3" /> },
  { label: "arXiv", url: "https://arxiv.org", icon: <BookOpenIcon className="size-3" /> },
  { label: "DOI Resolver", url: "https://doi.org", icon: <LinkIcon className="size-3" /> },
  { label: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov", icon: <SearchIcon className="size-3" /> },
  { label: "dblp", url: "https://dblp.org", icon: <BookOpenIcon className="size-3" /> },
  { label: "Semantic Scholar", url: "https://www.semanticscholar.org", icon: <GraduationCapIcon className="size-3" /> },
];

export function BrowserSidebar() {
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);

  const handleBookmark = (url: string) => {
    if (activeTabId) navigateBrowserTab(activeTabId, url);
  };

  return (
    <>
      <SidebarHeader className="flex h-8 shrink-0 flex-row items-center px-3 py-0 gap-0">
        <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground truncate">
          Bookmarks
        </span>
      </SidebarHeader>
      <SidebarContent className="overflow-auto px-1.5 py-1">
        <SidebarMenu className="gap-0.5">
          {BOOKMARKS.map((b) => (
            <SidebarMenuButton
              key={b.url}
              size="sm"
              onClick={() => handleBookmark(b.url)}
              className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
            >
              {b.icon}
              <span className="truncate">{b.label}</span>
            </SidebarMenuButton>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
