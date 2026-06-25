/** CodeMirror merge — fold unchanged regions; keep 3 lines context per hunk. */
export const GIT_COLLAPSE_UNCHANGED = { margin: 3, minSize: 4 } as const;

/** Trim trailing whitespace per line for ignore-whitespace diff display. */
export function trimLinesForWsDiff(text: string): string {
  return text.split("\n").map((line) => line.trimEnd()).join("\n");
}

export function prepareDiffContents(
  oldContent: string,
  newContent: string,
  ignoreWhitespace: boolean,
): { oldContent: string; newContent: string } {
  if (!ignoreWhitespace) {
    return { oldContent, newContent };
  }
  return {
    oldContent: trimLinesForWsDiff(oldContent),
    newContent: trimLinesForWsDiff(newContent),
  };
}
