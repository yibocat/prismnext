/**
 * Native Interaction Tools for PrismNext Pi Agent Host.
 *
 * 4 tools covering listing, reading, writing, and opening interactive figure/plot cards.
 */

import { Type } from "@earendil-works/pi-ai";
import { TOOL_NAMES } from "../../../shared/tool-names";
import {
  listInteractionSummaries,
  readInteractionSpec,
  upsertInteractionSpec,
} from "../../services/interaction-store";
import {
  interactionFenceHint,
  interactionSpecRelativePath,
  parseInteractionSpec,
  type InteractionSpec,
} from "../../../shared/interaction-spec";
import { broadcastInteractionChanged } from "../../services/interaction-ui-events";
import type { NativeToolDefinition } from "./types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function specResponse(spec: InteractionSpec) {
  const hint = interactionFenceHint(spec.id, spec.title);
  return {
    ok: true,
    spec,
    relativePath: interactionSpecRelativePath(spec.id),
    fenceMarkdown: hint.fenceMarkdown,
    replyRule: hint.replyRule,
  };
}

export const interactionListTool: NativeToolDefinition = {
  name: TOOL_NAMES.interactionList,
  label: "List Interactions",
  description: "List saved figure and plot Interaction objects in .prismnext/interactions/.",
  parameters: Type.Object({
    kindPrefix: Type.Optional(Type.String({ description: "Optional kind prefix filter (e.g. plot. or figure.)" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const kindPrefix = str(args.kindPrefix);
    const items = listInteractionSummaries(ctx.projectRoot, kindPrefix || undefined);
    return { ok: true, items, count: items.length };
  },
};

export const interactionReadTool: NativeToolDefinition = {
  name: TOOL_NAMES.interactionRead,
  label: "Read Interaction",
  description: "Read one Interaction spec from .prismnext/interactions/<id>/spec.json (returns full JSON + fenceMarkdown for chat embed).",
  parameters: Type.Object({
    id: Type.String({ minLength: 1, description: "Exact interaction ID slug" }),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const id = str(args.id);
    if (!id) return { ok: false, error: "missing_id" };
    const { spec, error } = readInteractionSpec(ctx.projectRoot, id);
    if (!spec) return { ok: false, error: error ?? "not_found", id };
    return specResponse(spec);
  },
};

export const interactionWriteTool: NativeToolDefinition = {
  name: TOOL_NAMES.interactionWrite,
  label: "Write Interaction",
  description:
    "Create or update an Interaction spec (.prismnext/interactions/<id>/spec.json). " +
    "Embed the returned fenceMarkdown in your assistant reply after success.",
  parameters: Type.Object({
    spec: Type.Any({ description: "Full InteractionSpec object (figure.static or plot.*)" }),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => {
      const id = (args.spec as { id?: string })?.id;
      return id ? `.prismnext/interactions/${id}/spec.json` : ".prismnext/interactions/";
    },
  },
  async execute(args, ctx) {
    const parsed = parseInteractionSpec(args.spec);
    if (!parsed) return { ok: false, error: "invalid_spec" };

    const result = upsertInteractionSpec(ctx.projectRoot, parsed);
    if (!result.ok || !result.spec) {
      return { ok: false, error: result.error ?? "write_failed" };
    }

    broadcastInteractionChanged({
      projectRoot: ctx.projectRoot,
      id: result.spec.id,
      title: result.spec.title,
      reason: "write",
      focus: false,
    });

    return {
      ...specResponse(result.spec),
      created: result.created === true,
    };
  },
};

export const interactionOpenTool: NativeToolDefinition = {
  name: TOOL_NAMES.interactionOpen,
  label: "Open Interaction",
  description: "Open an Interaction object in the RightArea panel (focus tab).",
  parameters: Type.Object({
    id: Type.String({ minLength: 1, description: "Interaction ID to open" }),
    focus: Type.Optional(Type.Boolean({ description: "Whether to focus the RightArea tab (default true)" })),
  }),
  permission: {
    category: "read_only",
  },
  async execute(args, ctx) {
    const id = str(args.id);
    if (!id) return { ok: false, error: "missing_id" };
    const { spec, error } = readInteractionSpec(ctx.projectRoot, id);
    if (!spec) return { ok: false, error: error ?? "not_found", id };

    broadcastInteractionChanged({
      projectRoot: ctx.projectRoot,
      id: spec.id,
      title: spec.title,
      reason: "open",
      focus: args.focus !== false,
    });

    return {
      ok: true,
      id: spec.id,
      title: spec.title,
      focused: true,
      fenceMarkdown: interactionFenceHint(spec.id, spec.title).fenceMarkdown,
    };
  },
};

export const INTERACTION_TOOLS: NativeToolDefinition[] = [
  interactionListTool,
  interactionReadTool,
  interactionWriteTool,
  interactionOpenTool,
];
