/** Local Office / PDF documents
 * Segment: module
 * Answers: when to convert project Office/PDF/EPUB/CSV files to Markdown
 * Not here: literature PDF intensive reading; web URLs; tool how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { TOOL_NAMES } from "../../../../shared/agent/tool-names";
import { OFFICE_DOCUMENTS_PROMPT } from "./prompt";

export { OFFICE_DOCUMENTS_PROMPT };

export const OFFICE_DOCUMENTS_MODULE: PromptModule = {
  key: "office-documents",
  label: "Local documents (Office, PDF & related)",
  description:
    `Convert project Word / slides / sheets / PDF / EPUB / CSV via ${TOOL_NAMES.documentRead}. Library paper PDFs use literature-read-pdf.`,
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: OFFICE_DOCUMENTS_PROMPT,
};
