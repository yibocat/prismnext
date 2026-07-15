/**
 * Holds App / LeftSidebar panel imperative refs so programatic navigators
 * (chat tool deep-links, Agent `experiment-log open`) can maximize RightArea
 * the same way left-nav buttons do.
 */
import type { LeftNavPanelRefs } from "./types";

let panelRefs: LeftNavPanelRefs = {};

export function setLeftNavPanelRefs(refs: LeftNavPanelRefs): void {
  panelRefs = refs;
}

export function getLeftNavPanelRefs(): LeftNavPanelRefs {
  return panelRefs;
}
