import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, SendIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { AgentEvent } from "@shared/agent-runtime";
import type { PiLabStatus } from "@shared/pi-lab";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

type LabRole = "user" | "assistant" | "tool" | "system";

interface LabMessage {
  id: string;
  role: LabRole;
  text: string;
  toolName?: string;
  ok?: boolean;
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function reasonLabel(
  reason: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!reason) return t("settings.lab.ready");
  if (reason.startsWith("unsupported_pi_provider:")) {
    return t("settings.lab.reason.unsupportedProvider");
  }
  return t(`settings.lab.reason.${reason}`, { defaultValue: reason });
}

export function PiLabSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const provider = useSettingsStore((s) => s.settings.aiProvider);
  const modelId = useSettingsStore((s) => s.settings.aiModel);
  const apiKey = useSettingsStore((s) => {
    const id = s.settings.aiProvider;
    return id ? s.settings.aiApiKeys?.[id] : undefined;
  });

  const [status, setStatus] = useState<PiLabStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [permission, setPermission] = useState<PendingPermission | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantId = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const next = await window.electronAPI.piLabStatus({
      projectRoot: projectRoot ?? undefined,
    });
    setStatus(next);
  }, [projectRoot]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const offEvent = window.electronAPI.onPiLabEvent((event: AgentEvent) => {
      if (event.type === "text_delta") {
        const id = assistantId.current ?? newId("assistant");
        assistantId.current = id;
        setMessages((prev) => {
          const existing = prev.find((item) => item.id === id);
          if (!existing) {
            return [...prev, { id, role: "assistant", text: event.text }];
          }
          return prev.map((item) => (
            item.id === id ? { ...item, text: item.text + event.text } : item
          ));
        });
        return;
      }
      if (event.type === "tool_started") {
        setMessages((prev) => {
          const next = {
            id: event.toolCallId,
            role: "tool" as const,
            toolName: event.toolName,
            text: t("settings.lab.toolStarted", { name: event.toolName }),
          };
          return prev.some((item) => item.id === event.toolCallId)
            ? prev.map((item) => (item.id === event.toolCallId ? next : item))
            : [...prev, next];
        });
        return;
      }
      if (event.type === "tool_finished") {
        const preview = event.result === undefined
          ? ""
          : `\n${JSON.stringify(event.result, null, 2).slice(0, 800)}`;
        setMessages((prev) => {
          const text = event.denied
            ? t("settings.lab.toolDenied", { name: event.toolName })
            : event.error
              ? t("settings.lab.toolFailed", { name: event.toolName, error: event.error })
              : `${t("settings.lab.toolFinished", { name: event.toolName })}${preview}`;
          const next = {
            id: event.toolCallId,
            role: "tool" as const,
            toolName: event.toolName,
            ok: event.ok,
            text,
          };
          return prev.some((item) => item.id === event.toolCallId)
            ? prev.map((item) => (item.id === event.toolCallId ? { ...item, ...next } : item))
            : [...prev, next];
        });
        return;
      }
      if (event.type === "turn_failed") {
        setSending(false);
        assistantId.current = null;
        setMessages((prev) => [
          ...prev,
          { id: newId("system"), role: "system", text: event.error },
        ]);
        return;
      }
      if (
        event.type === "turn_finished"
        || event.type === "turn_cancelled"
      ) {
        setSending(false);
        assistantId.current = null;
        if (event.type === "turn_cancelled") {
          setPermission(null);
        }
      }
    });
    const offPermission = window.electronAPI.onPiLabPermission((request) => {
      setPermission(request);
    });
    return () => {
      offEvent();
      offPermission();
    };
  }, [t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, permission]);

  const canSend = Boolean(status?.ready && draft.trim() && !sending);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !projectRoot || sending) return;
    setDraft("");
    setSending(true);
    assistantId.current = null;
    setMessages((prev) => [...prev, { id: newId("user"), role: "user", text }]);
    const result = await window.electronAPI.piLabSend({
      projectRoot,
      text,
      provider,
      modelId: modelId ?? undefined,
      apiKey,
    });
    if (!result.ok) {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: newId("system"), role: "system", text: result.error || t("settings.lab.sendFailed") },
      ]);
    }
    void refreshStatus();
  }, [apiKey, draft, modelId, projectRoot, provider, refreshStatus, sending, t]);

  const cancel = useCallback(async () => {
    await window.electronAPI.piLabCancel();
    setSending(false);
    assistantId.current = null;
  }, []);

  const reset = useCallback(async () => {
    await window.electronAPI.piLabReset();
    setMessages([]);
    setPermission(null);
    setSending(false);
    assistantId.current = null;
    void refreshStatus();
  }, [refreshStatus]);

  const resolvePermission = useCallback(async (decision: "allow" | "deny") => {
    if (!permission) return;
    await window.electronAPI.piLabResolvePermission({
      requestId: permission.requestId,
      decision,
    });
    setPermission(null);
  }, [permission]);

  const modelLabel = useMemo(() => {
    const currentProvider = status?.provider || provider || "—";
    const currentModel = status?.modelId || modelId || "—";
    return `${currentProvider}/${currentModel}`;
  }, [modelId, provider, status]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-8 pt-8 pb-4 space-y-3">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.lab.title")}
          </h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.lab.subtitle")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted px-4 py-3">
          <p className="text-[length:var(--font-size-13)] font-medium">
            {t("settings.lab.bannerTitle")}
          </p>
          <p className={SETTINGS_ROW_DESC}>{t("settings.lab.bannerBody")}</p>
        </div>
        <div>
          <h3 className={SETTINGS_CATEGORY_HEADER}>{t("settings.lab.status")}</h3>
          <div className="flex flex-wrap gap-2 text-[length:var(--font-size-12)] text-muted-foreground">
            <span>{status?.sdk ?? "Pi"}</span>
            <span>·</span>
            <span>{t("settings.lab.node", { version: status?.nodeVersion ?? "—" })}</span>
            <span>·</span>
            <span>{modelLabel}</span>
            <span>·</span>
            <span>{reasonLabel(status?.ready ? undefined : status?.reason, t)}</span>
            <span>·</span>
            <span>{t("settings.lab.permissionMode", { mode: status?.permissionMode ?? "edit_auto" })}</span>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-4">
          {messages.length === 0 ? (
            <p className="text-[length:var(--font-size-13)] text-muted-foreground">
              {t("settings.lab.empty")}
            </p>
          ) : messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "rounded-lg border border-border bg-card px-3 py-2"
                  : message.role === "system"
                    ? "rounded-lg border border-border px-3 py-2 text-muted-foreground"
                    : "px-1 py-1"
              }
            >
              <p className="text-[length:var(--font-hint)] uppercase tracking-wide text-muted-foreground">
                {t(`settings.lab.role.${message.role}`)}
                {message.toolName ? ` · ${message.toolName}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-[length:var(--font-size-13)] leading-relaxed">
                {message.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-8 py-4 space-y-3">
        {permission ? (
          <div className="mx-auto max-w-3xl rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[length:var(--font-size-13)] font-medium">
              {t("settings.lab.permissionTitle", { name: permission.toolName })}
            </p>
            <p className="mt-1 font-mono text-[length:var(--font-size-12)] text-muted-foreground break-all">
              {JSON.stringify(permission.args)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void resolvePermission("allow")}>
                {t("settings.lab.allow")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void resolvePermission("deny")}>
                {t("settings.lab.deny")}
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("settings.lab.placeholder")}
            className="min-h-[4.5rem] resize-none"
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }
              event.preventDefault();
              void send();
            }}
          />
          <div className="flex flex-col gap-2">
            {sending ? (
              <Button size="icon" variant="outline" onClick={() => void cancel()} aria-label={t("settings.lab.cancel")}>
                <SquareIcon className="size-4" />
              </Button>
            ) : (
              <Button size="icon" disabled={!canSend} onClick={() => void send()} aria-label={t("settings.lab.send")}>
                {sending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => void reset()} aria-label={t("settings.lab.reset")}>
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
