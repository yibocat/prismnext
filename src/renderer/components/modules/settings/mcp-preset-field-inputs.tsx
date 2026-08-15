import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppBrowserLink } from "@/components/modules/shared/app-browser-link";
import type { McpPreset } from "@/lib/agent/mcp-presets";

const INPUT =
  "w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-size-13)] outline-none focus:border-primary/40";

function fieldLabelKey(presetId: string, fieldKey: string): string {
  if (fieldKey === "__path__") {
    return `settings.editor.mcp.fields.${presetId}.__path__`;
  }
  return `settings.editor.mcp.fields.${fieldKey}`;
}

export function McpPresetFieldInputs({
  preset,
  values,
  onChange,
  disabled = false,
}: {
  preset: McpPreset;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  if (!preset.fields?.length) return null;

  return (
    <div className="space-y-3">
      {preset.fields.map((field) => (
        <div key={field.key}>
          <label className="text-[length:var(--font-size-12)] text-muted-foreground mb-1 block">
            {t(fieldLabelKey(preset.id, field.key), { defaultValue: field.label })}
            {field.required ? " *" : ""}
          </label>
          <div className="relative">
            <input
              type={field.secret && !visible[field.key] ? "password" : "text"}
              className={cn(INPUT, field.secret && "pr-9")}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              disabled={disabled}
              readOnly={disabled}
            />
            {field.secret && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setVisible((v) => ({ ...v, [field.key]: !v[field.key] }))}
                disabled={disabled}
              >
                {visible[field.key] ? (
                  <EyeOffIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      ))}
      {preset.docsUrl && (
        <AppBrowserLink
          href={preset.docsUrl}
          className="inline-flex items-center gap-1 text-[length:var(--font-size-11)] text-primary hover:underline"
        >
          {t("settings.editor.mcp.documentation")} <ExternalLinkIcon className="size-3" />
        </AppBrowserLink>
      )}
    </div>
  );
}
