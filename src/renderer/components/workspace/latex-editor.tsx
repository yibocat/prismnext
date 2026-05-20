import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  lineNumbers,
  highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { latex } from "codemirror-lang-latex";
import { useTheme } from "next-themes";

const placeholder = String.raw`% Prism — LaTeX Editor
\documentclass{article}

\usepackage{graphicx}
\usepackage{amsmath}

\title{My Paper}
\author{Author Name}

\begin{document}

\maketitle

\begin{abstract}
This is the abstract of the paper.
\end{abstract}

\section{Introduction}
\label{sec:intro}

This is the introduction. We cite~\cite{ref:example}.

Our main equation:
\begin{equation}
  E = mc^2
  \label{eq:einstein}
\end{equation}

\section{Methods}
\label{sec:methods}

Our methods are described here.

\end{document}
`;

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const state = EditorState.create({
      doc: placeholder,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        latex(),
        syntaxHighlighting(defaultHighlightStyle),
        isDark ? oneDark : [],
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [isDark]);

  return (
    <div ref={containerRef} className="h-full overflow-auto [&_.cm-editor]:h-full" />
  );
}
