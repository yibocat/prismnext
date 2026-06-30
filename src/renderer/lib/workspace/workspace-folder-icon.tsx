import type { SVGProps } from "react";
import { icons, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultFolderIcon, isValidLucideIconName, type LucideIconName } from "./folder-icons";
import type { FolderFunction } from "@/types/workspace";

export function WorkspaceFolderIcon({
  name,
  className,
  title,
  ...props
}: {
  name: string;
  className?: string;
  title?: string;
} & Omit<SVGProps<SVGSVGElement>, "title">) {
  if (!isValidLucideIconName(name)) return null;
  const Icon = icons[name] as LucideIcon;
  return (
    <Icon
      className={cn("size-3.5 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    />
  );
}

export function resolveFolderIconForFunction(
  icon: string | undefined,
  func: FolderFunction,
): LucideIconName {
  if (icon?.trim() && isValidLucideIconName(icon.trim())) {
    return icon.trim() as LucideIconName;
  }
  return defaultFolderIcon(func);
}
