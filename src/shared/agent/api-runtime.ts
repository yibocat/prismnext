export type ChatRuntimeKind = "pi" | "opencode";

export function isAgentRuntime(runtime?: string | null): boolean {
  return runtime === "pi";
}
