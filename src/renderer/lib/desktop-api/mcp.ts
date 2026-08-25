/**
 * MCP config desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by mcp-servers-store. Team enable stays on teamsDesktop.
 */

import { forwardDesktop } from "./forward";

export const mcpDesktop = {
  mcpEnsure: forwardDesktop("mcpEnsure"),
  mcpReadTeamJson: forwardDesktop("mcpReadTeamJson"),
  mcpWriteTeamJson: forwardDesktop("mcpWriteTeamJson"),
};
