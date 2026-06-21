---
name: latex-figures-tables
description: Figures, tables, subfloats, captions, and cross-references in LaTeX
license: MIT
---

# LaTeX Figures & Tables

## When to use
- Creating or refactoring figure/table environments
- Fixing float placement, captions, labels, or \ref links

## Conventions
- Use \label{fig:...} / \label{tab:...} immediately after \caption.
- Reference with \ref{} or \autoref{} consistently with the project preamble.
- Prefer booktabs for tables; avoid vertical rules unless the venue requires them.
- For subfigures, match the package already loaded (subcaption vs subfig).