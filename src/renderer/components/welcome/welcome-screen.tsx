import { FolderOpenIcon, ClockIcon, XIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function WelcomeScreen() {
  const openProject = useDocumentStore((s) => s.openProject);
  const { recentProjects, removeRecentProject } = useProjectStore();

  const handleOpenFolder = async () => {
    try {
      const result = await window.electronAPI.dialogOpenFolder();
      if (!result.canceled && result.path) {
        await openProject(result.path);
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  };

  const handleOpenRecent = async (path: string) => {
    try {
      await openProject(path);
    } catch {
      // If project fails to open, remove it from recent list
      removeRecentProject(path);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Drag region for macOS titlebar */}
      <div className="drag-region h-[var(--titlebar-height)] shrink-0" />

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        {/* Logo and Title */}
        <div className="mb-8 text-center">
          <h1 className="font-bold text-4xl tracking-tight">Prism</h1>
          <p className="mt-2 text-muted-foreground text-lg">
            AI-powered LaTeX editor
          </p>
        </div>

        {/* Open Folder Button */}
        <Button size="lg" className="mb-8" onClick={handleOpenFolder}>
          <FolderOpenIcon className="mr-2 size-5" />
          Open Folder
        </Button>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="w-full max-w-md">
            <div className="mb-3 flex items-center gap-2 px-1">
              <ClockIcon className="size-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground text-sm">
                Recent Projects
              </span>
            </div>
            <ScrollArea className="max-h-64">
              <div className="space-y-1">
                {recentProjects.map((project) => (
                  <div
                    key={project.path}
                    className="group flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-muted"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => handleOpenRecent(project.path)}
                    >
                      <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">
                          {project.name}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          {project.path}
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentProject(project.path);
                      }}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-muted-foreground text-sm">v0.1.0</div>
      </div>
    </div>
  );
}
