/**
 * Esbuild alias target so Host can import AgentService (which pulls teams/catalog).
 * Host never calls these at runtime for agent send; they only keep the bundle closed.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const home = process.env.HOME || homedir();

export const app = {
  isPackaged: true,
  getAppPath: () => join(home, ".prismnext-host", "current"),
  getPath: (name: string) => {
    if (name === "home") return home;
    if (name === "userData" || name === "appData") return join(home, ".prismnext");
    return join(home, ".prismnext");
  },
  getVersion: () => process.env.PRISMNEXT_DESKTOP_VERSION || "0.0.0",
};

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (value: Buffer) => value.toString("utf8"),
};

export const ipcMain = { handle: () => undefined, on: () => undefined };
export const BrowserWindow = { getAllWindows: () => [] };
export const dialog = {};
export const shell = {};
export const nativeTheme = { shouldUseDarkColors: false };
export const net = {};
export const protocol = {};
export const session = {};
export const Tray = class {};
export const Menu = { buildFromTemplate: () => ({}) };
export const nativeImage = { createFromPath: () => ({}) };
export const Notification = class {};

const electron = {
  app,
  safeStorage,
  ipcMain,
  BrowserWindow,
  dialog,
  shell,
  nativeTheme,
  net,
  protocol,
  session,
  Tray,
  Menu,
  nativeImage,
  Notification,
};

export default electron;
