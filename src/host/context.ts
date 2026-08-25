export interface HostHandlerContext {
  remoteRoot: string | null;
  projectId: string | null;
  emit: (channel: string, payload: unknown) => void;
}
