import { useCallback, useEffect, useState } from "react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";
import { ChevronDownIcon, BotIcon } from "lucide-react";
import type { AgentProfileInfo } from "@shared/agent-profiles";

export function ProfileSelect() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const activeProfileId = useChatStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.activeProfileId ?? null,
  );
  const setActiveProfile = useChatStore((s) => s.setActiveProfile);

  const [profiles, setProfiles] = useState<AgentProfileInfo[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    if (!projectRoot) {
      setProfiles([]);
      return;
    }
    try {
      const [list, manifest] = await Promise.all([
        window.electronAPI.agentListProfiles(projectRoot),
        window.electronAPI.agentGetProfilesManifest(projectRoot),
      ]);
      setProfiles(list.filter((p) => p.enabled));
      setDefaultId(manifest.defaultProfileId || manifest.defaultMainProfileId || null);
    } catch {
      setProfiles([]);
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const effectiveId = activeProfileId ?? defaultId;
  const current = profiles.find((p) => p.id === effectiveId);

  if (!projectRoot || profiles.length === 0) return null;

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors max-w-[9rem]"
          title="Agent profile"
        >
          <BotIcon className="size-3 shrink-0" />
          <span className="truncate">{current?.name || "Profile"}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="w-56">
        <AppMenuLabel>Agent Profile</AppMenuLabel>
        <AppMenuCheckItem
          selected={!activeProfileId}
          onClick={() => setActiveProfile(activeTabId, null)}
        >
          Project default
        </AppMenuCheckItem>
        {profiles.map((profile) => (
          <AppMenuCheckItem
            key={profile.id}
            selected={effectiveId === profile.id}
            onClick={() => setActiveProfile(activeTabId, profile.id)}
          >
            {profile.name}
          </AppMenuCheckItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
