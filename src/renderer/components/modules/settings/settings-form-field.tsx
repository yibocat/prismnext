import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SETTINGS_FORM_FIELD, SETTINGS_ROW_DESC } from "./settings-tokens";

interface SettingsFormFieldProps {
  label: string;
  htmlFor?: string;
  description?: string;
  labelExtra?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint — matches add-provider / profile dialog form rows. */
export function SettingsFormField({
  label,
  htmlFor,
  description,
  labelExtra,
  children,
  className,
}: SettingsFormFieldProps) {
  return (
    <div className={cn(SETTINGS_FORM_FIELD, className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[length:var(--font-size-12)] font-medium">
          {label}
        </Label>
        {labelExtra}
      </div>
      {children}
      {description ? <p className={SETTINGS_ROW_DESC}>{description}</p> : null}
    </div>
  );
}
