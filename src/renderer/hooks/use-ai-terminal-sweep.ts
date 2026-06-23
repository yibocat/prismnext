import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { AI_TERMINAL_SWEEP_INTERVAL_MS } from "@/lib/terminal/ai-terminal-lifecycle";

/** Periodically GC idle AI terminal tabs (Phase B). */
export function useAiTerminalSweep(): void {
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) return;

    const tick = () => {
      useTerminalAiStore.getState().sweepIdleAiTerminalTabs();
    };

    tick();
    const id = window.setInterval(tick, AI_TERMINAL_SWEEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loaded]);
}
