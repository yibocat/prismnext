import { useCompileStore } from "@/stores/compile-store";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CompilerSettings() {
  const compilerBackend = useCompileStore((s) => s.compilerBackend);
  const setCompilerBackend = useCompileStore((s) => s.setCompilerBackend);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
  const compilerStatus = useCompileStore((s) => s.compilerStatus);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Compiler</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            LaTeX compilation settings.
          </p>
        </div>

        {/* Default engine */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[length:var(--font-button)] font-medium">Default engine</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              LaTeX compiler used for new projects.
            </p>
          </div>
          <Select value={compilerBackend} onValueChange={(v) => setCompilerBackend(v as "tectonic" | "texlive")}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tectonic" disabled={!compilerStatus?.tectonic}>Tectonic</SelectItem>
              <SelectItem value="texlive" disabled={!compilerStatus?.texlive.available}>
                {compilerStatus?.texlive.engines?.[0] || "TeXLive"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Auto compile */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[length:var(--font-button)] font-medium">Auto compile</p>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Automatically compile on save.
            </p>
          </div>
          <Toggle
            size="sm"
            pressed={autoCompile}
            onPressedChange={toggleAutoCompile}
          >
            {autoCompile ? "On" : "Off"}
          </Toggle>
        </div>
      </div>
    </div>
  );
}
