import { app, Menu, BrowserWindow } from "electron";
import { getSettings } from "./app/settings";
import {
  normalizeAppLocalePreference,
  resolveAppLocale,
} from "../shared/platform/app-locale";
import { menuStrings } from "../shared/platform/menu-i18n";

type MenuWindowApi = {
  getTargetWindow: () => BrowserWindow | null;
  createWindow: () => BrowserWindow;
};

let menuApi: MenuWindowApi | null = null;

/** Rebuild menu after `appLocale` or developer prompt-internals changes. */
export function refreshApplicationMenu(): void {
  if (menuApi) installApplicationMenu(menuApi);
}

/** Override macOS/Electron default Cmd+W (close window) → close tab in renderer. */
export function installApplicationMenu(api: MenuWindowApi): void {
  menuApi = api;
  const isMac = process.platform === "darwin";
  const resolved = resolveAppLocale(
    normalizeAppLocalePreference(getSettings().appLocale),
    app.getLocale(),
  );
  const t = menuStrings(resolved);

  const sendToTarget = (channel: string, ...args: unknown[]) => {
    const win = api.getTargetWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  };

  const showPromptInternals = getSettings().showPromptInternals === true;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: t.file,
      submenu: [
        {
          label: t.newWindow,
          accelerator: "CmdOrCtrl+N",
          click: () => {
            api.createWindow();
          },
        },
        {
          label: t.closeTab,
          accelerator: "CmdOrCtrl+W",
          click: () => sendToTarget("app:closeTab"),
        },
        { type: "separator" },
        ...(isMac
          ? [{ role: "close" as const, label: t.closeWindow, accelerator: "CmdOrCtrl+Shift+W" }]
          : [{ role: "quit" as const }]),
      ],
    },
    {
      label: t.edit,
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: t.view,
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { type: "separator" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
        { role: "minimize" as const },
      ],
    },
    {
      label: t.help,
      role: "help",
      submenu: [
        {
          label: t.developer,
          submenu: [
            {
              type: "checkbox",
              label: t.showFullPromptText,
              checked: showPromptInternals,
              click: (item) => {
                sendToTarget("app:setPromptInternals", item.checked === true);
              },
            },
          ],
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
