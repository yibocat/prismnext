import { FilePlusIcon } from "lucide-react";

export function NoFileOpen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted mx-auto">
          <FilePlusIcon className="size-7 text-muted-foreground" />
        </div>
        <p className="mt-3 text-[length:var(--font-empty-state)] text-muted-foreground">No open files</p>
      </div>
    </div>
  );
}
