import * as fs from "fs";
import * as path from "path";
import { projectTerminalDirRel } from "../../shared/workbench-paths";

// ─── Types ───

export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  description?: string;
  order: number;
  createdAt: number;
}

export interface TerminalConfig {
  quickCommands: QuickCommand[];
}

// ─── Constants ───

const TERMINAL_DIR = projectTerminalDirRel();
const CONFIG_FILE = "config.json";

// ─── Service ───

/** Load terminal config from `.workbench/terminal/config.json`. */
export function loadConfig(projectRoot: string): TerminalConfig {
  const dir = path.join(projectRoot, TERMINAL_DIR);
  const filePath = path.join(dir, CONFIG_FILE);

  if (!fs.existsSync(filePath)) {
    return { quickCommands: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as TerminalConfig;
  } catch {
    return { quickCommands: [] };
  }
}

/** Save terminal config to `.workbench/terminal/config.json`. */
export function saveConfig(projectRoot: string, config: TerminalConfig): void {
  const dir = path.join(projectRoot, TERMINAL_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, CONFIG_FILE);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}
