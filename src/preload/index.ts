import { contextBridge } from "electron";
import { platformApi } from "./platform";
import { fsApi } from "./fs";
import { templateApi } from "./template";
import { dialogApi } from "./dialog";
import { shellApi } from "./shell";
import { projectApi } from "./project";
import { workbenchApi } from "./workbench";
import { researchBriefApi } from "./research-brief";
import { researchPlanApi } from "./research-plan";
import { experimentApi } from "./experiment";
import { interactionApi } from "./interaction";
import { provenanceApi } from "./provenance";
import { updateApi } from "./update";
import { proLicenseApi } from "./pro-license";
import { windowApi } from "./window";
import { compileApi } from "./compile";
import { literatureApi } from "./literature";
import { literatureExtractApi } from "./literature-extract";
import { zoteroApi } from "./zotero";
import { bibliographyApi } from "./bibliography";
import { mcpApi } from "./mcp";
import { agentApi } from "./agent";
import { subagentsApi } from "./subagents";
import { settingsApi } from "./settings";
import { commandsApi } from "./commands";
import { teamsApi } from "./teams";
import { workspaceApi } from "./workspace";
import { browserApi } from "./browser";
import { terminalApi } from "./terminal";
import { executionApi } from "./execution";
import { gitApi } from "./git";
import { gitHostingApi } from "./git-hosting";
import { worktreeApi } from "./worktree";
import { skillsApi } from "./skills";
import { logApi } from "./log";
import { themeApi } from "./theme";
import { remoteApi } from "./remote";

contextBridge.exposeInMainWorld("electronAPI", {
	...platformApi,
	...fsApi,
	...templateApi,
	...dialogApi,
	...shellApi,
	...projectApi,
	...workbenchApi,
	...researchBriefApi,
	...researchPlanApi,
	...experimentApi,
	...interactionApi,
	...provenanceApi,
	...updateApi,
	...proLicenseApi,
	...windowApi,
	...compileApi,
	...literatureApi,
	...literatureExtractApi,
	...zoteroApi,
	...bibliographyApi,
	...mcpApi,
	...agentApi,
	...subagentsApi,
	...settingsApi,
	...commandsApi,
	...teamsApi,
	...workspaceApi,
	...browserApi,
	...terminalApi,
	...executionApi,
	...gitApi,
	...gitHostingApi,
	...worktreeApi,
	...skillsApi,
	...logApi,
	...themeApi,
	...remoteApi,
});
