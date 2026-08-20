/**
 * Native Interaction Tools for PrismNext Pi Agent Host.
 *
 * 4 tools covering listing, reading, writing, and opening interactive figure/plot cards.
 */

import { Type } from "@earendil-works/pi-ai";
import { entityToolOutcome } from "../../../shared/agent-runtime";
import { TOOL_NAMES } from "../../../shared/tool-names";
import {
  listInteractionSummaries,
  readInteractionSpec,
  upsertInteractionSpec,
} from "../../services/interaction-store";
import {
  interactionFenceHint,
  interactionSpecRelativePath,
  coerceInteractionSpecInput,
  explainInteractionSpecFailure,
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
  promptGuidelines: [
    "Use before updating an object or when the user asks what figures/plots already exist.",
    "`kindPrefix` narrows to e.g. `plot.` or `figure.`; ids returned here feed interaction-read / interaction-open.",
  ],
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
  promptGuidelines: [
    "Use interaction-list to discover ids first; ids are the directory names under .prismnext/interactions/.",
    "The returned `fenceMarkdown` is what you embed in your reply to give the user a clickable card.",
  ],
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
  promptGuidelines: [
    "An Interaction is for figures/plots the user will revisit — not a one-shot peek (`artifact` fence).",
    "Pass a spec object: id, title, kind (`figure.static` or `plot.*`), compute, revision, resources[].path. After success, embed fenceMarkdown.",
    "plot.* needs a real CSV in resources[] plus params.x / params.y.",
  ],
  parameters: Type.Object({
    spec: Type.Any({
      description:
        "InteractionSpec object — not a JSON string. figure.static example: {\"id\":\"fig.demo\",\"title\":\"Demo\",\"kind\":\"figure.static\",\"compute\":\"local\",\"revision\":1,\"resources\":[{\"role\":\"figure\",\"path\":\"figures/demo.pdf\"}]}",
    }),
  }),
  permission: {
    category: "safe_write",
    extractPath: (args) => {
      const coerced = coerceInteractionSpecInput(args.spec);
      const id =
        coerced && typeof coerced === "object" && !Array.isArray(coerced)
          ? (coerced as { id?: unknown }).id
          : undefined;
      return typeof id === "string" && id.trim()
        ? `.prismnext/interactions/${id.trim()}/spec.json`
        : ".prismnext/interactions/";
    },
  },
  async execute(args, ctx) {
    const parsed = parseInteractionSpec(coerceInteractionSpecInput(args.spec));
    if (!parsed) {
      return { ok: false, error: "invalid_spec", hint: explainInteractionSpecFailure(args.spec) };
    }

    const result = upsertInteractionSpec(ctx.projectRoot, parsed);
    if (!result.ok || !result.spec) {
      return {
        ok: false,
        error: result.error ?? "write_failed",
        hint: result.error ?? "write_failed",
      };
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
      outcome: entityToolOutcome("interaction", result.spec.id, result.spec.title),
    };
  },
};

export const interactionOpenTool: NativeToolDefinition = {
  name: TOOL_NAMES.interactionOpen,
  label: "Open Interaction",
  description: "Open an Interaction object in the RightArea panel (focus tab).",
  promptGuidelines: [
    "Read-only — does not mutate the spec. Use when the user explicitly asks to open the panel view.",
    "Still prefer embedding the `fenceMarkdown` from interaction-read/write in your reply so the user also has a chat card.",
  ],
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
