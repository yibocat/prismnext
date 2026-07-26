/**
 * Shared “New experiment” trigger + dialog (Station 1).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExperimentsCreateDialog } from "./experiments-create-dialog";

export function ExperimentsNewButton({
  className,
  variant = "secondary",
  size = "sm",
  disabled,
}: {
  className?: string;
  variant?: "secondary" | "default" | "ghost";
  size?: "sm" | "xs" | "default";
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled}
        className={cn(className)}
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="size-3.5" aria-hidden />
        {t("experiments.create.new")}
      </Button>
      <ExperimentsCreateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
