import type { CompilerStatus } from "@/stores/compile-store";

/** Human label for the engine Prism will use (Tectonic bundled first). */
export function resolveActiveCompileEngineLabel(
  status: CompilerStatus | null | undefined,
): string {
  if (!status) return "…";
  if (status.tectonic) return "Tectonic";
  if (status.texlive.available) {
    return status.texlive.engines?.[0] || "TeX Live";
  }
  return "—";
}

export function isCompileEngineAvailable(
  status: CompilerStatus | null | undefined,
): boolean {
  return Boolean(status?.tectonic || status?.texlive?.available);
}
