import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { latex, latexLinter } from "codemirror-lang-latex";

const CITE_WITHOUT_BIB_MSG =
  "\\cite used but no \\bibliography or thebibliography environment found";

/** Whether the buffer declares a bibliography (classic BibTeX or biblatex). */
export function documentHasBibliography(tex: string): boolean {
  return (
    /\\bibliography\s*\{/.test(tex)
    || /\\begin\s*\{thebibliography\}/.test(tex)
    || /\\addbibresource(?:\[[^\]]*\])?\s*\{/.test(tex)
    || /\\printbibliography\b/.test(tex)
  );
}

function withBiblatexAwareCiteLint(
  base: (view: EditorView) => Diagnostic[],
): (view: EditorView) => Diagnostic[] {
  return (view) => {
    const diagnostics = base(view);
    if (!documentHasBibliography(view.state.doc.toString())) {
      return diagnostics;
    }
    return diagnostics.filter((d) => d.message !== CITE_WITHOUT_BIB_MSG);
  };
}

type LatexConfig = NonNullable<Parameters<typeof latex>[0]>;

/**
 * LaTeX language support with biblatex-aware cite/bibliography linting.
 * codemirror-lang-latex only treats \\bibliography / thebibliography as valid.
 */
export function prismLatex(config?: LatexConfig): Extension {
  const fileName = config?.fileName ?? "";
  const linterOpts = config?.linter ?? {};
  const enableLinting = config?.enableLinting !== false;
  const innerLinter = latexLinter({ ...linterOpts, fileName });

  const language = latex({ ...config, enableLinting: false });

  if (!enableLinting) {
    return language;
  }

  return [language, linter(withBiblatexAwareCiteLint(innerLinter))];
}
