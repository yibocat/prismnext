import { useEffect, useState } from "react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { CircleIcon, BoltIcon, SparklesIcon, TerminalIcon } from "lucide-react";
import { useCompileStore } from "@/stores/compile-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { countActiveTerminalActivity } from "@/lib/terminal/terminal-sidebar-items";

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

function StatusRow({
  label,
  status,
  detail,
  icon,
}: {
  label: string;
  status: Status;
  detail?: string;
  icon?: React.ReactNode;
}) {
  const text: Record<Status, string> = {
    connecting: "Connecting…",
    connected: "Running",
    disconnected: "Stopped",
    placeholder: "—",
  };
  return (
    <div className="flex items-center gap-2">
      {icon ?? (
        <CircleIcon className={`size-2.5 ${COLORS[status]} fill-current shrink-0`} />
      )}
      <span className="text-[length:var(--font-hint)] text-muted-foreground flex-1">
        {label}
      </span>
      <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums">
        {detail ?? text[status]}
      </span>
    </div>
  );
}

export function ServerStatusDot() {
  const [agentStatus, setAgentStatus] = useState<Status>("connecting");
  const sessionStates = useTerminalAiStore((s) => s.sessionStates);
  const rightTabs = useRightPanelStore((s) => s.tabs);
  const terminalSessions = useTerminalStore((s) => s.sessions);

  const activity = countActiveTerminalActivity();

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

  void sessionStates;
  void rightTabs;
  void terminalSessions;

  const dotStatus: Status = agentStatus;
  const terminalAttention = activity.aiRunning > 0 || activity.userBusy > 0;

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="relative inline-flex items-center justify-center size-5 shrink-0 rounded-full"
        >
          <CircleIcon
            className={`size-2.5 ${COLORS[dotStatus]} fill-current hover:scale-125 transition-transform duration-200`}
            aria-label="System status"
          />
          {terminalAttention ? (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-warning text-[9px] font-medium text-background flex items-center justify-center tabular-nums">
              {activity.aiRunning + activity.userBusy}
            </span>
          ) : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-52 p-3">
        <div className="space-y-2">
          <StatusRow label="Agent" status={agentStatus} />
          <CompileStatusRow />
          <StatusRow
            label="AI Terminal"
            status={activity.aiRunning > 0 ? "connected" : "placeholder"}
            detail={
              activity.aiRunning > 0
                ? `${activity.aiRunning} cmd running · ${activity.aiOpen} view open`
                : activity.aiOpen > 0
                  ? `${activity.aiOpen} view open`
                  : "—"
            }
            icon={<SparklesIcon className={`size-3 shrink-0 ${activity.aiRunning > 0 ? "text-warning" : "text-muted-foreground/40"}`} />}
          />
          <StatusRow
            label="Terminal"
            status={activity.userBusy > 0 ? "connected" : "placeholder"}
            detail={activity.userBusy > 0 ? `${activity.userBusy} busy` : "—"}
            icon={<TerminalIcon className={`size-3 shrink-0 ${activity.userBusy > 0 ? "text-warning" : "text-muted-foreground/40"}`} />}
          />
          <StatusRow label="MCP" status="placeholder" />
          <StatusRow label="LSP" status="placeholder" />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
