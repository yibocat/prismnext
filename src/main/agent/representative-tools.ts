/**
 * Spike representative tools — four paths that prove ToolHost + PermissionGate.
 * Services are injected so tests never need Electron or a live catalog.
 */

import { updateResearchBriefSection } from "../services/research-brief-service";
import { TOOL_NAMES } from "../../shared/tool-names";
import type { DiscoverLiteratureInput, DiscoverLiteratureResult } from "../../shared/literature-discovery";
import type { NativeToolDefinition, ToolExecuteContext } from "./tool-host";

export interface LiteratureSearchHit {
  id: string;
  bibkey?: string;
  title: string;
  authors?: string | null;
  year?: number | null;
  doi?: string | null;
}

export type LiteratureSearchFn = (input: {
  projectRoot: string;
  query: string;
  limit?: number;
  tag?: string;
  collection?: string;
}) => LiteratureSearchHit[] | Promise<LiteratureSearchHit[]>;

export type LiteratureDiscoverFn = (
  input: DiscoverLiteratureInput,
) => Promise<DiscoverLiteratureResult>;

export type ResearchBriefUpdateFn = (
  projectRoot: string,
  section: string,
  content: string,
  options?: { append?: boolean },
) => { ok: boolean; path: string; section: string; error?: string };

export type ExperimentRunFn = (input: {
  experimentId: string;
  command: string;
  toolCallId: string;
  projectRoot: string;
  abortSignal?: AbortSignal;
  artifacts?: string[];
  notes?: string;
  kind?: string;
  interpreter?: string;
  pythonPath?: string;
}) => Promise<unknown>;

export interface RepresentativeToolDeps {
  searchPapers: LiteratureSearchFn;
  discoverLiterature: LiteratureDiscoverFn;
  updateBrief?: ResearchBriefUpdateFn;
  runExperiment: ExperimentRunFn;
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : "";
}

function compactPaper(hit: LiteratureSearchHit): LiteratureSearchHit {
  return {
    id: hit.id,
    bibkey: hit.bibkey,
    title: hit.title,
    authors: hit.authors ?? null,
    year: hit.year ?? null,
    doi: hit.doi ?? null,
  };
}

export function createRepresentativeTools(deps: RepresentativeToolDeps): NativeToolDefinition[] {
  const updateBrief = deps.updateBrief ?? updateResearchBriefSection;

  return [
    {
      name: TOOL_NAMES.literatureSearch,
      description: "Search papers in the project literature library (local only).",
      async execute(args, ctx: ToolExecuteContext) {
        const query = str(args, "query");
        const limit = typeof args.limit === "number" ? args.limit : 20;
        const hits = await deps.searchPapers({
          projectRoot: ctx.projectRoot,
          query,
          limit,
          tag: str(args, "tag") || undefined,
          collection: str(args, "collection") || undefined,
        });
        return {
          query,
          count: hits.length,
          papers: hits.map(compactPaper),
        };
      },
    },
    {
      name: TOOL_NAMES.literatureDiscover,
      description: "Search external academic catalogs by topic.",
      async execute(args) {
        const query = str(args, "query");
        if (!query.trim()) {
          return { ok: false, error: "missing_query" };
        }
        const sources = Array.isArray(args.sources)
          ? args.sources.filter((s): s is string => typeof s === "string")
          : undefined;
        return deps.discoverLiterature({
          query,
          sources,
          limit: typeof args.limit === "number" ? args.limit : undefined,
          year: str(args, "year") || undefined,
          author: str(args, "author") || undefined,
        });
      },
    },
    {
      name: TOOL_NAMES.researchBriefUpdate,
      description: "Update one section of the project research brief.",
      async execute(args, ctx) {
        const section = str(args, "section");
        const content = str(args, "content");
        if (!section.trim() || !content.trim()) {
          return { ok: false, error: "missing_section_or_content" };
        }
        return updateBrief(ctx.projectRoot, section, content, {
          append: args.append === true,
        });
      },
    },
    {
      name: TOOL_NAMES.experimentRun,
      description: "Run a shell command in an experiment island after PermissionGate.",
      async execute(args, ctx) {
        const experimentId = str(args, "id");
        const command = str(args, "command");
        if (!experimentId.trim() || !command.trim()) {
          return { ok: false, error: "missing_id_or_command" };
        }
        const artifacts = Array.isArray(args.artifacts)
          ? args.artifacts.filter((item): item is string => typeof item === "string")
          : undefined;
        return deps.runExperiment({
          experimentId,
          command,
          toolCallId: ctx.toolCallId,
          projectRoot: ctx.projectRoot,
          abortSignal: ctx.abortSignal,
          artifacts,
          notes: str(args, "notes") || undefined,
          kind: str(args, "kind") || undefined,
          interpreter: str(args, "interpreter") || undefined,
          pythonPath: str(args, "pythonPath") || undefined,
        });
      },
    },
  ];
}
