// components/modules/settings/zotero-settings.tsx
import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";

// ── Shared tokens (exact match with AppearanceSettings) ──
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const ROW = "flex items-center justify-between py-2.5 group";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium leading-none";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";

export function ZoteroSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Zotero</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Sync references from your Zotero library.
          </p>
        </div>

        <div className={CARD}>
          <div className={ROW}>
            <div>
              <p className={ROW_LABEL}>API Key</p>
              <p className={ROW_DESC}>Required for Zotero library sync.</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Input
                type={showKey ? "text" : "password"}
                className="!h-7 !text-[length:var(--font-size-12)] w-48"
                placeholder="Enter key…"
                value={settings.zoteroApiKey || ""}
                onChange={(e) => updateSettings({ zoteroApiKey: e.target.value })}
              />
              <Button variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
              </Button>
            </div>
          </div>
          <div className={ROW}>
            <div>
              <p className={ROW_LABEL}>User ID</p>
              <p className={ROW_DESC}>Your numeric Zotero user identifier.</p>
            </div>
            <Input
              className="!h-7 !text-[length:var(--font-size-12)] w-48"
              placeholder="123456"
              value={settings.zoteroUserId || ""}
              onChange={(e) => updateSettings({ zoteroUserId: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
