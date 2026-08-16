/**
 * ToolHost wrappers for literature tools that production still reaches via
 * the disk bridge. Considered homes: representative-tools.ts (would become
 * a 29-tool dump), src/main/tools/*.ts (Bun, cannot import Main services).
 */

import { TOOL_NAMES } from "../../shared/tool-names";
import { BUILTIN_TOOLS } from "../tools/index";
import { buildOpencodeToolDescription } from "../tools/tool-description";
import type { LiteratureActionRequest } from "../services/literature-bridge";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export type LiteratureActionFn = (
  req: LiteratureActionRequest,
) => unknown | Promise<unknown>;

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : "";
}

function descriptionFor(name: string): string {
  const meta = BUILTIN_TOOLS.find((tool) => tool.name === name);
  return meta ? buildOpencodeToolDescription(meta) : name;
}

function baseReq(
  action: LiteratureActionRequest["action"],
  ctx: ToolExecuteContext,
): Pick<LiteratureActionRequest, "action" | "projectRoot" | "sessionId"> {
  return {
    action,
    projectRoot: ctx.projectRoot,
    sessionId: ctx.runtimeSessionId,
  };
}

export function createLiteratureNativeTools(deps?: {
  executeLiteratureAction?: LiteratureActionFn;
}): NativeToolDefinition[] {
  const run = deps?.executeLiteratureAction ?? (async (req) => {
    const { executeLiteratureAction } = await import("../services/literature-bridge");
    return executeLiteratureAction(req);
  });

  return [
    {
      name: TOOL_NAMES.literatureRead,
      description: descriptionFor(TOOL_NAMES.literatureRead),
      async execute(args, ctx) {
        const bibkey = str(args, "bibkey");
        if (!bibkey) return { error: "Missing bibkey parameter." };
        return run({ ...baseReq("read", ctx), bibkey });
      },
    },
    {
      name: TOOL_NAMES.literatureReadPdf,
      description: descriptionFor(TOOL_NAMES.literatureReadPdf),
      async execute(args, ctx) {
        const bibkey = str(args, "bibkey");
        if (!bibkey) return { error: "Missing bibkey parameter." };
        const source = args.source;
        const req: LiteratureActionRequest = {
          ...baseReq("read-pdf", ctx),
          bibkey,
          force: args.force === true,
        };
        const pages = str(args, "pages");
        const query = str(args, "query");
        if (pages) req.pages = pages;
        if (query) req.query = query;
        if (source === "mineru" || source === "pdfjs" || source === "html" || source === "auto") {
          req.source = source;
        }
        return run(req);
      },
    },
    {
      name: TOOL_NAMES.literatureIntensiveReading,
      description: descriptionFor(TOOL_NAMES.literatureIntensiveReading),
      async execute(args, ctx) {
        const raw = str(args, "action").toLowerCase();
        const intensiveAction = raw === "remove" || raw === "list" || raw === "add" ? raw : "add";
        const bibkey = str(args, "bibkey");
        if ((intensiveAction === "add" || intensiveAction === "remove") && !bibkey) {
          return { error: "Missing bibkey parameter for add/remove." };
        }
        const req: LiteratureActionRequest = {
          ...baseReq("intensive-reading", ctx),
          intensiveAction,
        };
        if (bibkey) req.bibkey = bibkey;
        return run(req);
      },
    },
    {
      name: TOOL_NAMES.literatureStage,
      description: descriptionFor(TOOL_NAMES.literatureStage),
      async execute(args, ctx) {
        const doi = str(args, "doi");
        const arxivId = str(args, "arxivId");
        if (!doi && !arxivId) {
          return {
            staged: false,
            verified: false,
            error: "Provide exactly one of doi or arxivId.",
          };
        }
        if (doi && arxivId) {
          return { staged: false, verified: false, error: "Provide only one of doi or arxivId." };
        }
        const allowed = ["literature-discover", "websearch", "webfetch", "user", "agent"] as const;
        const raw = str(args, "discoveredFrom") || "agent";
        const discoveredFrom = (allowed as readonly string[]).includes(raw)
          ? raw as (typeof allowed)[number]
          : "agent";
        const req: LiteratureActionRequest = {
          ...baseReq("stage", ctx),
          discoveredFrom,
        };
        if (doi) req.doi = doi;
        if (arxivId) req.arxivId = arxivId;
        const sourceUrl = str(args, "sourceUrl");
        if (sourceUrl) req.sourceUrl = sourceUrl;
        return run(req);
      },
    },
    {
      name: TOOL_NAMES.literatureAdd,
      description: descriptionFor(TOOL_NAMES.literatureAdd),
      async execute(args, ctx) {
        const doi = str(args, "doi");
        const arxivId = str(args, "arxivId");
        if (!doi && !arxivId) {
          return { error: "Provide exactly one of doi or arxivId." };
        }
        if (doi && arxivId) {
          return { error: "Provide only one of doi or arxivId, not both." };
        }
        const req: LiteratureActionRequest = { ...baseReq("add", ctx) };
        if (doi) req.doi = doi;
        if (arxivId) req.arxivId = arxivId;
        const collection = str(args, "collection");
        if (collection) req.collection = collection;
        return run(req);
      },
    },
    {
      name: TOOL_NAMES.literatureDelete,
      description: descriptionFor(TOOL_NAMES.literatureDelete),
      async execute(args, ctx) {
        const bibkey = str(args, "bibkey");
        if (!bibkey) return { error: "Missing bibkey parameter." };
        return run({ ...baseReq("delete", ctx), bibkey });
      },
    },
    {
      name: TOOL_NAMES.citationHealth,
      description: descriptionFor(TOOL_NAMES.citationHealth),
      async execute(args, ctx) {
        return run({
          ...baseReq("citation-health", ctx),
          verify: args.verify !== false,
        });
      },
    },
    {
      name: TOOL_NAMES.literatureExportBib,
      description: descriptionFor(TOOL_NAMES.literatureExportBib),
      async execute(args, ctx) {
        const req: LiteratureActionRequest = {
          ...baseReq("export-bib", ctx),
          all: args.all === true,
        };
        if (Array.isArray(args.bibkeys)) {
          req.bibkeys = args.bibkeys.filter((item): item is string => typeof item === "string");
        }
        if (args.onlyCitedInTex === false) req.onlyCitedInTex = false;
        return run(req);
      },
    },
  ];
}
