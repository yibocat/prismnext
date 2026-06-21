import { useEffect, useState } from "react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { CircleIcon, BoltIcon } from "lucide-react";
import { useCompileStore } from "@/stores/compile-store";

type Status = "connecting" | "connected" | "disconnected" | "placeholder";

const COLORS: Record<Status, string> = {
  connecting: "text-yellow-500",
  connected: "text-green-500",
  disconnected: "text-red-500",
  placeholder: "text-muted-foreground/40",
};

function CompileStatusRow() {
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const backend = useCompileStore((s) => s.compilerBackend);
  const backendLabel = backend === "tectonic" ? "Tectonic" : "TeXLive";

  return (
    <div className="flex items-center gap-2">
      <BoltIcon className={`size-3 shrink-0 ${autoCompile ? "text-yellow-500" : "text-muted-foreground/30"}`} />
      <span className="text-[length:var(--font-hint)] text-muted-foreground flex-1">
        LaTeX
      </span>
      <span className="text-[length:var(--font-hint)] text-muted-foreground/60">
        {backendLabel}
      </span>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: Status }) {
  const text: Record<Status, string> = {
    connecting: "Connecting…",
    connected: "Running",
    disconnected: "Stopped",
    placeholder: "—",
  };
  return (
    <div className="flex items-center gap-2">
      <CircleIcon className={`size-2.5 ${COLORS[status]} fill-current shrink-0`} />
      <span className="text-[length:var(--font-hint)] text-muted-foreground flex-1">
        {label}
      </span>
      <span className="text-[length:var(--font-hint)] text-muted-foreground/60">
        {text[status]}
      </span>
    </div>
  );
}

export function ServerStatusDot() {
  const [agentStatus, setAgentStatus] = useState<Status>("connecting");

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const s = await window.electronAPI.chatStatus();
        if (!alive) return;
        setAgentStatus(s.available ? "connected" : "disconnected");
      } catch {
        if (alive) setAgentStatus("disconnected");
      }
    };

    check();
    const timer = setInterval(check, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  // Overall dot color: red if any critical service is down
  const dotStatus: Status = agentStatus;

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center size-5 shrink-0 rounded-full"
        >
          <CircleIcon
            className={`size-2.5 ${COLORS[dotStatus]} fill-current hover:scale-125 transition-transform duration-200`}
            aria-label="System status"
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-48 p-3">
        <div className="space-y-2">
          <StatusRow label="Agent" status={agentStatus} />
          <CompileStatusRow />
          <StatusRow label="MCP" status="placeholder" />
          <StatusRow label="LSP" status="placeholder" />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
