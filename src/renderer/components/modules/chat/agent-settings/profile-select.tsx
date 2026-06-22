import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";
import { CheckIcon, ChevronDownIcon, BotIcon } from "lucide-react";
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors max-w-[9rem]"
          title="Agent profile"
        >
          <BotIcon className="size-3 shrink-0" />
          <span className="truncate">{current?.name || "Profile"}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Agent Profile
        </div>
        <DropdownMenuItem onClick={() => setActiveProfile(activeTabId, null)}>
          <span className="flex-1 text-[length:var(--font-chat-meta)]">Project default</span>
          {!activeProfileId && <CheckIcon className="size-3 shrink-0" />}
        </DropdownMenuItem>
        {profiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            onClick={() => setActiveProfile(activeTabId, profile.id)}
          >
            <span className="flex-1 text-[length:var(--font-chat-meta)] truncate">
              {profile.name}
            </span>
            {effectiveId === profile.id && <CheckIcon className="size-3 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
