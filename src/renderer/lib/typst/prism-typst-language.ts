import { StreamLanguage } from "@codemirror/language";
import type { StreamParser } from "@codemirror/language";

/**
 * Lightweight Typst highlighter for CodeMirror.
 * Not a full grammar (Tinymist / tree-sitter) — markup + `#` code is enough to read.
 */
const KEYWORDS = new Set([
  "let",
  "set",
  "show",
  "import",
  "include",
  "if",
  "else",
  "for",
  "while",
  "break",
  "continue",
  "return",
  "in",
  "not",
  "and",
  "or",
  "as",
  "context",
]);

type Mode = "markup" | "code";

type State = {
  mode: Mode;
  codeDepth: number;
  lineStart: boolean;
};

const parser: StreamParser<State> = {
  name: "typst",
  startState: () => ({ mode: "markup", codeDepth: 0, lineStart: true }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (stream.sol()) state.lineStart = true;

    if (stream.match("//")) {
      stream.skipToEnd();
      state.lineStart = false;
      return "comment";
    }
    if (stream.match("/*")) {
      if (!stream.skipTo("*/")) stream.skipToEnd();
      else stream.match("*/");
      state.lineStart = false;
      return "comment";
    }

    if (state.mode === "markup" && state.lineStart && stream.match(/^=+/)) {
      stream.skipToEnd();
      state.lineStart = false;
      return "heading";
    }

    if (stream.match(/^\$/)) {
      state.lineStart = false;
      if (!stream.skipTo("$")) stream.skipToEnd();
      else stream.next();
      return "string";
    }

    if (stream.match(/^"/)) {
      state.lineStart = false;
      while (!stream.eol()) {
        if (stream.peek() === "\\") {
          stream.next();
          stream.next();
          continue;
        }
        if (stream.next() === '"') break;
      }
      return "string";
    }

    if (stream.match(/^</)) {
      state.lineStart = false;
      if (!stream.skipTo(">")) stream.skipToEnd();
      else stream.next();
      return "labelName";
    }

    if (stream.match(/^@[A-Za-z_][\w-]*/)) {
      state.lineStart = false;
      return "variableName";
    }

    if (stream.match(/^#/)) {
      state.lineStart = false;
      const word = stream.match(/^[A-Za-z_][\w-]*/);
      const ident = Array.isArray(word) ? word[0] : "";
      if (stream.peek() === "(" || stream.peek() === "[" || stream.peek() === "{") {
        state.mode = "code";
        state.codeDepth = 1;
      }
      if (KEYWORDS.has(ident)) return "keyword";
      return ident ? "variableName" : "operator";
    }

    if (state.mode === "code") {
      if (stream.match(/^[()\[\]{}]/)) {
        const ch = stream.current();
        if (ch === "(" || ch === "[" || ch === "{") state.codeDepth++;
        else {
          state.codeDepth = Math.max(0, state.codeDepth - 1);
          if (state.codeDepth === 0) state.mode = "markup";
        }
        state.lineStart = false;
        return "bracket";
      }
      if (stream.match(/^(let|set|show|import|include|if|else|for|while|return|in|not|and|or|as|context)\b/)) {
        state.lineStart = false;
        return "keyword";
      }
      if (stream.match(/^[A-Za-z_][\w-]*/)) {
        state.lineStart = false;
        return "variableName";
      }
      if (stream.match(/^\d+(\.\d+)?/)) {
        state.lineStart = false;
        return "number";
      }
    }

    if (stream.match(/^(\*|_){1,2}/)) {
      state.lineStart = false;
      return "strong";
    }

    stream.next();
    state.lineStart = false;
    return null;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
};

export function prismTypst() {
  return StreamLanguage.define(parser);
}
