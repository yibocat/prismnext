import type { SessionProvider, SessionInfo } from "../types";

export class QoderSessionProvider implements SessionProvider {
  private projectRoot: string | null = null;
  setProjectRoot(path: string): void { this.projectRoot = path; }
  async listSessions(): Promise<SessionInfo[]> { return []; }
  async loadSession(_sessionId: string): Promise<any[]> { return []; }
  async deleteSession(_sessionId: string): Promise<void> {
    throw new Error("Not implemented: deleteSession for Qoder");
  }
}
