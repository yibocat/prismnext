/**
 * Filesystem desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by document-store, changes-store, and checkpoint-store.
 */

import { forwardDesktop } from "./forward";

export const fsDesktop = {
  fsScan: forwardDesktop("fsScan"),
  fsScanMetadata: forwardDesktop("fsScanMetadata"),
  fsRead: forwardDesktop("fsRead"),
  fsReadImage: forwardDesktop("fsReadImage"),
  fsExists: forwardDesktop("fsExists"),
  fsIsFile: forwardDesktop("fsIsFile"),
  fsWrite: forwardDesktop("fsWrite"),
  fsCreate: forwardDesktop("fsCreate"),
  fsMkdir: forwardDesktop("fsMkdir"),
  fsDelete: forwardDesktop("fsDelete"),
  fsDeleteFolder: forwardDesktop("fsDeleteFolder"),
  fsRename: forwardDesktop("fsRename"),
};
