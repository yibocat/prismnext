import { GlobeIcon } from "lucide-react";
import { SidebarContent } from "@/components/ui/sidebar";

export function BrowserSidebar() {
  return (
    <SidebarContent className="px-1.5 py-1">
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-center text-[length:var(--font-empty-state)] leading-relaxed text-muted-foreground">
          <GlobeIcon className="size-6 mx-auto mb-2 opacity-40" />
          Browser
          <span className="mt-1 block text-[length:var(--font-hint)] opacity-60">coming soon</span>
        </p>
      </div>
    </SidebarContent>
  );
}
