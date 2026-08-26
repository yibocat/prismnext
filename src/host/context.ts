export interface HostHandlerContext {
  remoteRoot: string | null;
  projectId: string | null;
  emit: (channel: string, payload: unknown) => void;
  agent?: import("../main/agent/agent-service").AgentService;
  modelKeys?: "gateway" | "remote";
  extraBaseUrls?: string[];
}
