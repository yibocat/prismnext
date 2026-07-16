import type { ResolvedAppLocale } from "./app-locale";

const MENU: Record<
  ResolvedAppLocale,
  { file: string; closeTab: string; edit: string; view: string }
> = {
  en: {
    file: "File",
    closeTab: "Close Tab",
    edit: "Edit",
    view: "View",
  },
  "zh-CN": {
    file: "文件",
    closeTab: "关闭标签页",
    edit: "编辑",
    view: "查看",
  },
  "zh-HK": {
    file: "檔案",
    closeTab: "關閉分頁",
    edit: "編輯",
    view: "檢視",
  },
};

export function menuStrings(locale: ResolvedAppLocale) {
  return MENU[locale] ?? MENU.en;
}
