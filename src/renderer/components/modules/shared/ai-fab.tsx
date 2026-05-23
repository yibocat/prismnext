import { MessageSquarePlusIcon } from "lucide-react";

export function AiFab() {
  return (
    <div className="absolute bottom-5 right-5 z-10">
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
        title="Open AI Assistant"
      >
        <MessageSquarePlusIcon className="size-5" />
      </button>
    </div>
  );
}
