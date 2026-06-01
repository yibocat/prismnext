import { getLanguageName } from "@/lib/language-mappings";

interface LanguageLabelProps {
  ext: string;
}

export function LanguageLabel({ ext }: LanguageLabelProps) {
  const name = getLanguageName(ext);
  if (!name || name === "Plain Text") return null;

  return (
    <span className="text-[length:var(--font-size-12)] text-muted-foreground select-none px-1">
      {name}
    </span>
  );
}
