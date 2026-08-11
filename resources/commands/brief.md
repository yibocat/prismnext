---
description: Ensure research brief exists; AI reads/updates project-root .brief.md
action: ensure-research-brief
order: 102
---

Research brief workflow (binding):
1. Call `research-brief-read` first — do not guess project design from chat memory.
2. Work from the brief sections; use `research-brief-update` for changed sections only (one section per call) after the user confirms.
3. Do not use generic edit/write on `.brief.md`.

When the user request below is empty, summarize which sections are still placeholder-only and ask what to refine.

User request:
$ARGUMENTS
