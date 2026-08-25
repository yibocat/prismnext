/** Re-home OpenCode sessions from a removed worktree checkout to the project root. */
import { agentDesktop } from "@/lib/desktop-api/agent";

export async function rehomeWorktreeSessions(
  projectRoot: string,
  worktreePath: string,
): Promise<number> {
  if (!projectRoot || !worktreePath || worktreePath === projectRoot) return 0;
  try {
    const count = (await agentDesktop.agentReassignDirectory({
      fromDirectory: worktreePath,
      toDirectory: projectRoot,
    })).count;
    const { requestSessionListRefresh } = await import("@/lib/chat/session-list-refresh");
    requestSessionListRefresh();
    return count;
  } catch {
    return 0;
  }
}
