export type TerminalProcessStatus = "starting" | "running" | "exited" | "killed" | "error";

export interface TerminalQuickCommand {
  id: string;
  label: string;
  command: string;
  description?: string;
  order: number;
  createdAt: number;
}

export interface TerminalConfig {
  quickCommands: TerminalQuickCommand[];
}

export interface TerminalEnvInfo {
  shell: string;
  cwd: string;
  platform: string;
  nodeVersion: string;
  home: string;
}

export interface TerminalCommandBlock {
  command?: string;
  output: string;
  capturedAt?: number;
}

export interface TerminalSessionInfo {
  tabId: string;
  sessionId: string;
  shell: string;
  cwd: string;
  pid: number;
  status: TerminalProcessStatus;
  /** True when a foreground command may still be running. */
  busy: boolean;
  /** Last command submitted in this session (for tab/toolbar label). */
  lastCommand?: string;
  /** Last completed command block (OSC 133 capture when available). */
  lastCommandBlock?: TerminalCommandBlock;
  exitCode?: number;
  startedAt: number;
  endedAt?: number;
}
