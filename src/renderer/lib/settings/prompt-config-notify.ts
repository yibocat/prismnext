import { toast } from "sonner";
import { useChatStore } from "@/stores/chat-store";

const PROMPT_APPLY_HINT =
  "Changes apply to new conversations. Start a new chat to use the updated prompt.";

export function notifyPromptConfigChanged(): void {
  toast.info(PROMPT_APPLY_HINT);
  void useChatStore.getState().checkPromptStale();
}
