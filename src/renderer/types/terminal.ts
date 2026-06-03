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
