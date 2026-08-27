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

export type CompileEngineTone = "checking" | "ready" | "missing";

export function compileEngineTone(
  status: CompilerStatus | null | undefined,
): CompileEngineTone {
  if (!status) return "checking";
  return isCompileEngineAvailable(status) ? "ready" : "missing";
}

export function compileEngineIconClass(tone: CompileEngineTone): string {
  if (tone === "ready") return "text-success";
  if (tone === "missing") return "text-warning";
  return "text-muted-foreground/40";
}
