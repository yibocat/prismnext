import { useTranslation } from "react-i18next";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useChatStore } from "@/stores/chat-store";
import type { SessionAgent } from "../../../../../shared/session-agent";
import {
  ChevronDownIcon,
  HammerIcon,
  ListTodoIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { COMPOSER_TOOLBAR_TRIGGER } from "../worktree-selector";

const SESSION_AGENT_OPTIONS: SessionAgent[] = ["build", "plan"];

const SESSION_AGENT_ICONS: Record<SessionAgent, LucideIcon> = {
  build: HammerIcon,
  plan: ListTodoIcon,
};

const SESSION_AGENT_I18N: Record<
  SessionAgent,
  { label: string; short: string; desc: string }
> = {
  build: {
    label: "chat.sessionAgent.build",
    short: "chat.sessionAgent.buildShort",
    desc: "chat.sessionAgent.buildDesc",
  },
  plan: {
    label: "chat.sessionAgent.plan",
    short: "chat.sessionAgent.planShort",
    desc: "chat.sessionAgent.planDesc",
  },
};

interface SessionAgentSelectProps {
  compact?: boolean;
}

export function SessionAgentSelect({ compact }: SessionAgentSelectProps) {
  const { t } = useTranslation();
  const sessionAgent = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return tab?.sessionAgent ?? "build";
  });
  const requestSetSessionAgent = useChatStore((s) => s.requestSetSessionAgent);

  const CurrentIcon = SESSION_AGENT_ICONS[sessionAgent];
  const currentKeys = SESSION_AGENT_I18N[sessionAgent];

  const hintLabel =
    sessionAgent === "plan"
      ? `${t(currentKeys.label)} — ${t("chat.sessionAgent.planHint")}`
      : t(currentKeys.desc);

  const handleSelect = (agent: SessionAgent) => {
    requestSetSessionAgent(agent);
  };

  return (
    <AppMenu>
      <Hint label={hintLabel}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              COMPOSER_TOOLBAR_TRIGGER,
              compact && "size-6 justify-center px-0",
            )}
          >
            <CurrentIcon className="size-3 shrink-0" />
            {!compact && (
              <>
                <span>{t(currentKeys.short)}</span>
                <ChevronDownIcon className="size-3 shrink-0" />
              </>
            )}
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="end" className="w-64">
        <AppMenuLabel>{t("chat.sessionAgent.label")}</AppMenuLabel>
        {SESSION_AGENT_OPTIONS.map((option) => {
          const keys = SESSION_AGENT_I18N[option];
          return (
            <AppMenuCheckItem
              key={option}
              selected={sessionAgent === option}
              description={t(keys.desc)}
              onClick={() => handleSelect(option)}
            >
              {t(keys.label)}
            </AppMenuCheckItem>
          );
        })}
      </AppMenuContent>
    </AppMenu>
  );
}
