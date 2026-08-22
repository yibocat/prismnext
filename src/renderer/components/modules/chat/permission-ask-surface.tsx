/**
 * Shared Allow / Deny card used by the chat composer gate and Experiments Run.
 * Do not add a second confirm chrome — pass callbacks and optional timeout.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  CornerDownLeftIcon,
  FileDiffIcon,
  FileEditIcon,
  ShieldIcon,
  TerminalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { Progress } from "@/components/ui/progress";
import { ComposerChromeCard } from "./composer-chrome-card";

/** Delete / move — path is the whole story; no expand preview needed. */
export function isSimplePathPermissionGate(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === "delete" || n === "move";
}

export type PermissionAskSummary = { label: string; detail: string };
export type PermissionAskPeek = { path: string; preview: string };

export interface PermissionAskSurfaceProps {
  toolName: string;
  summary: PermissionAskSummary;
  peek: PermissionAskPeek;
  resolving?: boolean;
  onAllow: (always?: boolean) => void;
  onDeny: () => void;
  showAlways?: boolean;
  alwaysLabel?: string;
  /** When set with onTimeout, auto-deny after this many ms. */
  timeoutMs?: number;
  onTimeout?: () => void;
}

function PermissionIcon({ toolName }: { toolName: string }) {
  const n = toolName.toLowerCase();
  if (n === "bash" || n === "experiment-run") {
    return <TerminalIcon className="size-3.5 shrink-0 text-warning" />;
  }
  if (n === "apply_patch") return <FileDiffIcon className="size-3.5 shrink-0 text-info" />;
  if (n === "delete") return <FileEditIcon className="size-3.5 shrink-0 text-destructive" />;
  if (n === "move") return <FileEditIcon className="size-3.5 shrink-0 text-info" />;
  if (n.startsWith("edit") || n.startsWith("write")) {
    return <FileEditIcon className="size-3.5 shrink-0 text-info" />;
  }
  return <ShieldIcon className="size-3.5 shrink-0 text-primary" />;
}

function CountdownProgress({
  active,
  timeoutMs,
}: {
  active: boolean;
  timeoutMs: number;
}) {
  const { t } = useTranslation();
  const startRef = useRef<number | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setValue(0);
      return;
    }
    startRef.current = Date.now();
    setValue(0);
    const tick = () => {
      const start = startRef.current;
      if (start == null) return;
      const elapsed = Date.now() - start;
      setValue(Math.min(100, (elapsed / timeoutMs) * 100));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [active, timeoutMs]);

  if (!active) return null;

  const remaining = Math.max(
    0,
    Math.ceil((timeoutMs - (value / 100) * timeoutMs) / 1000),
  );

  return (
    <div className="space-y-1 border-t border-border px-2.5 py-2">
      <Progress
        value={value}
        aria-label={t("dialogs.permission.autoDeny", { seconds: remaining })}
        className="h-1"
      />
      <p className="text-[length:var(--font-size-11)] text-muted-foreground/60">
        {t("dialogs.permission.autoDeny", { seconds: remaining })}
      </p>
    </div>
  );
}

export function PermissionAskSurface({
  toolName,
  summary,
  peek,
  resolving = false,
  onAllow,
  onDeny,
  showAlways = false,
  alwaysLabel,
  timeoutMs,
  onTimeout,
}: PermissionAskSurfaceProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const settledRef = useRef(false);
  const isSimple = isSimplePathPermissionGate(toolName);
  const hasExpandBody = !isSimple && !!(peek.path || peek.preview);
  const confirmLabel = isSimple ? summary.label : t("dialogs.permission.allow");
  const timeoutActive = Boolean(timeoutMs && onTimeout && !resolving);

  useEffect(() => {
    settledRef.current = false;
    setExpanded(false);
  }, [summary.label, summary.detail, peek.path, peek.preview]);

  useEffect(() => {
    if (!timeoutMs || !onTimeout) return;
    const timer = setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      onTimeout();
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs, onTimeout]);

  const allow = (always = false) => {
    if (settledRef.current || resolving) return;
    settledRef.current = true;
    onAllow(always);
  };

  const deny = () => {
    if (settledRef.current || resolving) return;
    settledRef.current = true;
    onDeny();
  };

  if (isSimple) {
    return (
      <ComposerChromeCard className="overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[length:var(--font-chat-meta)]">
          <span className="min-w-0 flex-1 truncate text-left">
            <span className="font-medium text-foreground">{summary.label}</span>
            {" "}
            <span className="text-muted-foreground">{summary.detail}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-0.5 text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
              onClick={deny}
              disabled={resolving}
            >
              {t("dialogs.permission.skip")}
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 font-medium",
                "bg-primary text-primary-foreground transition-opacity",
                "hover:opacity-90",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
              onClick={() => allow(false)}
              disabled={resolving}
            >
              {confirmLabel}
              <CornerDownLeftIcon className="size-3 shrink-0 opacity-80" aria-hidden />
            </button>
          </div>
        </div>
        {timeoutMs ? (
          <CountdownProgress active={timeoutActive} timeoutMs={timeoutMs} />
        ) : null}
      </ComposerChromeCard>
    );
  }

  return (
    <ComposerChromeCard
      className={cn(
        "overflow-hidden transition-colors",
        hasExpandBody && "cursor-pointer hover:bg-muted",
      )}
      onClick={() => {
        if (hasExpandBody) setExpanded((v) => !v);
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[length:var(--font-chat-meta)]">
        <PermissionIcon toolName={toolName} />
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="font-medium text-foreground">{summary.label}</span>
          <span className="text-muted-foreground"> · {summary.detail}</span>
        </span>
        {hasExpandBody ? (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden
          />
        ) : null}
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={cn(
              "rounded px-1.5 py-0.5 text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
            onClick={deny}
            disabled={resolving}
          >
            {t("dialogs.permission.deny")}
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-1.5 py-0.5 font-medium text-primary transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
            onClick={() => allow(false)}
            disabled={resolving}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      {expanded && hasExpandBody ? (
        <div className="space-y-1.5 border-t border-border px-2.5 py-2">
          {peek.path ? (
            <p className="break-all font-mono text-[length:var(--font-code)] text-muted-foreground">
              {peek.path}
            </p>
          ) : null}
          {peek.preview ? (
            <p className="line-clamp-3 break-all font-mono text-[length:var(--font-code)] text-muted-foreground">
              {peek.preview}
            </p>
          ) : null}
          {showAlways ? (
            <div
              className="flex justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <Hint label={alwaysLabel}>
                <button
                  type="button"
                  className={cn(
                    "rounded px-2 py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-40",
                  )}
                  onClick={() => allow(true)}
                  disabled={resolving || !toolName}
                >
                  {t("dialogs.permission.always")}
                </button>
              </Hint>
            </div>
          ) : null}
        </div>
      ) : null}
      {timeoutMs ? (
        <CountdownProgress active={timeoutActive} timeoutMs={timeoutMs} />
      ) : null}
    </ComposerChromeCard>
  );
}
