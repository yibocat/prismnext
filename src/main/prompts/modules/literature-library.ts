import { TOOL_NAMES } from "../../../shared/tool-names";

/** Project library discovery — tags, AI summaries, search tools. */
export const LITERATURE_LIBRARY_PROMPT = [
  "## Project literature library",
  "",
  "Papers in `.prismnext/library/library.db` may include **user tags** and an **AI summary** (generated in the Literature panel).",
  "",
  "**Discovery:**",
  `- \`${TOOL_NAMES.literatureSearch}\` — full-text search over title, abstract, authors, bibkey, **tags**, and **ai_summary**.`,
  `- Same tool with \`tag=\` — list papers carrying that exact project tag (case-insensitive), e.g. tag=\"World Model\".`,
  `- \`${TOOL_NAMES.literatureRead}\` — full record for one bibkey, including parsed \`tags[]\` and \`ai_summary\`.`,
  "",
  "When the user asks for papers on a topic you tagged in the library, prefer `tag=` or a search query matching the tag text — do not rely on abstract alone.",
].join("\n");
