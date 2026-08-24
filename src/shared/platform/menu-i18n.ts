import type { ResolvedAppLocale } from "./app-locale";

const MENU: Record<
  ResolvedAppLocale,
  {
    file: string;
    newWindow: string;
    closeTab: string;
    closeWindow: string;
    edit: string;
    view: string;
  }
> = {
  en: {
    file: "File",
    newWindow: "New Window",
    closeTab: "Close",
    closeWindow: "Close Window",
    edit: "Edit",
    view: "View",
  },
  "zh-CN": {
    file: "文件",
    newWindow: "新建窗口",
    closeTab: "关闭",
    closeWindow: "关闭窗口",
    edit: "编辑",
    view: "查看",
  },
  "zh-HK": {
    file: "檔案",
    newWindow: "新建視窗",
    closeTab: "關閉",
    closeWindow: "關閉視窗",
    edit: "編輯",
    view: "檢視",
  },
};

export function menuStrings(locale: ResolvedAppLocale) {
  return MENU[locale] ?? MENU.en;
}
