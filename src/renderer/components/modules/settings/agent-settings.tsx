import { Bot } from "lucide-react";

const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1";
const CARD = "rounded-lg border border-border px-4 py-4";

export function AgentSettings() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Agent</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Agent runtime configuration and behavior controls.
          </p>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>Agent Configuration</h3>
          <div className={CARD}>
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Bot className="size-8 text-muted-foreground/30" />
              <div>
                <p className="text-[length:var(--font-size-13)] font-medium text-muted-foreground">
                  Agent controls coming soon
                </p>
                <p className="text-[length:var(--font-size-12)] text-muted-foreground/60 mt-1">
                  Thought level, effort, and provider-level settings will be configured here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
