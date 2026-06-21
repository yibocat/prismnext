---
name: academic-citations
description: BibTeX/biblatex citation keys, \cite commands, and bibliography hygiene
license: MIT
---

# Academic Citations

## When to use
- Adding or fixing citations and bibliography entries
- Choosing \citep vs \citet (natbib) or biblatex equivalents
- Resolving duplicate keys, missing entries, or wrong entry types

## Workflow
1. Locate the .bib file(s) and citation style (natbib/biblatex + biber/bibtex).
2. Prefer consistent cite keys: AuthorYearKeyword (e.g. Smith2020GNSS).
3. Use the project's existing \cite macro style; do not mix natbib and biblatex syntax.
4. After edits, note if a recompile + biber/bibtex pass is required.