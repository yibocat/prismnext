import { ArrowUpIcon, FileIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { composerQueueItemPreview } from "@/lib/chat/composer-send-queue";
import { useChatStore } from "@/stores/chat-store";

const ROW_BTN =
  "flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function ComposerSendQueuePanel({
  onEdit,
  onSendOne,
  onDelete,
  className,
}: {
  onEdit: (id: string) => void;
  onSendOne: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const queue = useChatStore(
    (s) => s.tabs.find((x) => x.id === s.activeTabId)?.composerSendQueue ?? [],
  );

  if (queue.length === 0) return null;

  return (
    <div
      data-chat-width
      className={cn(
        "flex w-full max-h-[min(40vh,320px)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pt-1.5 pb-1">
        <span className="text-[length:var(--font-chat-meta)] font-medium text-foreground">
          {t("chat.composer.queueCount", { count: queue.length })}
        </span>
        <span
          className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted font-mono text-[10px] leading-none text-muted-foreground"
          aria-hidden
        >
          ↵
        </span>
        <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
          {t("chat.composer.queueEnterToSend")}
        </span>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-1.5">
        {queue.map((item) => {
          const preview = composerQueueItemPreview(item);
          return (
            <li
              key={item.id}
              className="flex min-h-8 items-center gap-2 rounded-md bg-muted px-2 py-1"
            >
              <div className="flex shrink-0 items-center gap-1">
                {item.attachments.slice(0, 3).map((att) =>
                  att.kind === "image" && att.previewUrl ? (
                    <img
                      key={att.id}
                      src={att.previewUrl}
                      alt={att.name}
                      className="size-5 rounded object-cover"
                    />
                  ) : (
                    <span
                      key={att.id}
                      className="flex size-5 items-center justify-center rounded bg-card"
                      title={att.name}
                    >
                      <FileIcon className="size-3 text-muted-foreground" />
                    </span>
                  ),
                )}
                {item.attachments.length > 3 && (
                  <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                    +{item.attachments.length - 3}
                  </span>
                )}
              </div>

              <span className="min-w-0 flex-1 truncate text-[length:var(--font-size-12)] text-foreground">
                {preview}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                <Hint label={t("chat.composer.queueEdit")}>
                  <button
                    type="button"
                    className={ROW_BTN}
                    aria-label={t("chat.composer.queueEdit")}
                    onClick={() => onEdit(item.id)}
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                </Hint>
                <Hint label={t("chat.composer.queueSendOne")}>
                  <button
                    type="button"
                    className={ROW_BTN}
                    aria-label={t("chat.composer.queueSendOne")}
                    onClick={() => onSendOne(item.id)}
                  >
                    <ArrowUpIcon className="size-3.5" />
                  </button>
                </Hint>
                <Hint label={t("chat.composer.queueDelete")}>
                  <button
                    type="button"
                    className={ROW_BTN}
                    aria-label={t("chat.composer.queueDelete")}
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </Hint>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
