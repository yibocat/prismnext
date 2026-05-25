import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";

export function ExternalSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">AI & APIs</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            External service connections and API keys.
          </p>
        </div>

        {/* Zotero API Key */}
        <div className="space-y-2">
          <p className="text-[length:var(--font-button)] font-medium">Zotero API Key</p>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground">
            Used to sync references from your Zotero library.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type={showKey ? "text" : "password"}
              className="text-[length:var(--font-input)]"
              placeholder="Enter API key..."
              value={settings.zoteroApiKey || ""}
              onChange={(e) => updateSettings({ zoteroApiKey: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
            </Button>
          </div>
        </div>

        {/* Zotero User ID */}
        <div className="space-y-2">
          <p className="text-[length:var(--font-button)] font-medium">Zotero User ID</p>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground">
            Your numeric Zotero user or group ID.
          </p>
          <Input
            className="text-[length:var(--font-input)]"
            placeholder="123456"
            value={settings.zoteroUserId || ""}
            onChange={(e) => updateSettings({ zoteroUserId: e.target.value })}
          />
        </div>

        {/* MCP Servers — placeholder */}
        <div className="space-y-2">
          <p className="text-[length:var(--font-button)] font-medium">MCP Servers</p>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground/50">
            Coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
