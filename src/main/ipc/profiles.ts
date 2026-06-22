import { ipcMain } from "electron";
import {
  deleteCustomProfile,
  getProfileDetail,
  getProfileEditorOptions,
  listAgentProfiles,
  listDisabledBuiltinProfiles,
  readProfilesManifest,
  resetAllBuiltinProfilesToDefaults,
  restoreBuiltinProfiles,
  resetBuiltinProfileOverride,
  saveBuiltinProfileOverride,
  saveCustomProfile,
  setBuiltinProfileEnabled,
} from "../services/profiles-sync";
import type {
  AgentProfileInfo,
  ProfilesManifest,
  SaveBuiltinProfileOverridePayload,
  SaveCustomProfilePayload,
} from "../services/agent-profiles";

export function registerProfilesHandlers(): void {
  ipcMain.handle("agent:listProfiles", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as AgentProfileInfo[];
    return listAgentProfiles(args.projectPath);
  });

  ipcMain.handle("agent:getProfilesManifest", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) {
      return { disabledBuiltinIds: [] } as ProfilesManifest;
    }
    return readProfilesManifest(args.projectPath);
  });

  ipcMain.handle(
    "agent:setBuiltinProfileEnabled",
    async (_event, args: { projectPath: string; profileId: string; enabled: boolean }) => {
      const manifest = setBuiltinProfileEnabled(args.projectPath, args.profileId, args.enabled);
      return { manifest, profiles: listAgentProfiles(args.projectPath) };
    },
  );

  ipcMain.handle(
    "agent:listDisabledBuiltinProfiles",
    async (_event, args: { projectPath: string }) => {
      if (!args.projectPath) return [] as AgentProfileInfo[];
      return listDisabledBuiltinProfiles(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:restoreBuiltinProfiles",
    async (_event, args: { projectPath: string; profileIds?: string[] }) => {
      const manifest = restoreBuiltinProfiles(args.projectPath, args.profileIds);
      return { manifest, profiles: listAgentProfiles(args.projectPath) };
    },
  );

  ipcMain.handle(
    "agent:resetBuiltinProfilesToDefaults",
    async (_event, args: { projectPath: string }) => {
      const manifest = resetAllBuiltinProfilesToDefaults(args.projectPath);
      return { manifest, profiles: listAgentProfiles(args.projectPath) };
    },
  );

  ipcMain.handle(
    "agent:getProfileDetail",
    async (_event, args: { projectPath: string; profileId: string }) => {
      if (!args.projectPath) return null;
      return getProfileDetail(args.projectPath, args.profileId);
    },
  );

  ipcMain.handle(
    "agent:getProfileEditorOptions",
    async (_event, args: { projectPath: string }) => {
      if (!args.projectPath) {
        return {
          skills: [],
          mcpServers: [],
          modules: [],
          commands: [],
          rules: [],
        };
      }
      return getProfileEditorOptions(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:saveCustomProfile",
    async (_event, args: { projectPath: string; payload: SaveCustomProfilePayload }) => {
      const profile = saveCustomProfile(args.projectPath, args.payload);
      return { profile, profiles: listAgentProfiles(args.projectPath) };
    },
  );

  ipcMain.handle(
    "agent:saveBuiltinProfileOverride",
    async (_event, args: { projectPath: string; payload: SaveBuiltinProfileOverridePayload }) => {
      const profile = saveBuiltinProfileOverride(args.projectPath, args.payload);
      return { profile, profiles: listAgentProfiles(args.projectPath) };
    },
  );

  ipcMain.handle(
    "agent:resetBuiltinProfileOverride",
    async (_event, args: { projectPath: string; profileId: string }) => {
      const profile = resetBuiltinProfileOverride(args.projectPath, args.profileId);
      return { profile, profiles: listAgentProfiles(args.projectPath) };
    },
  );

  ipcMain.handle(
    "agent:deleteCustomProfile",
    async (_event, args: { projectPath: string; profileId: string }) => {
      deleteCustomProfile(args.projectPath, args.profileId);
      return { profiles: listAgentProfiles(args.projectPath) };
    },
  );
}
