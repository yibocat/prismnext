---
name: idea-lab
description: Use for open-ended ideation — brainstorming bold or half-formed ideas, thinking out loud with the AI, giving an early hunch a gentle first look, or mining the literature for inspiration, analogies, and contradictions. Divergence first, judgment later; converging into a hypothesis is optional and always the user's call.
license: MIT
---

# Idea Lab

The only skill whose job is **divergence**. Every other research skill
converges — sharpens, falsifies, verifies. This one holds the space open:
generate before judging, associate before testing, park before discarding.
The time judgment stays absent is the time ideas grow.

## When to use

- "I have a bold / half-formed idea — let's talk it through"
- Brainstorming directions, mechanisms, or explanations
- Mining the literature for inspiration — analogies, collisions, openings
- An early "is this anything?" — a gentle first look, not a verdict
- Stuck: the current frame feels exhausted and needs reframing

Not for: sharpening a settled idea into preregistered claims (that belongs
to `hypothesis-design`), or deep criticism of a mature draft
(`critical-review`) — route there when the user is ready, or do the key
step inline.

## Stance

- Divergence before convergence. Quantity first; wild ideas explicitly
  welcome.
- "Yes, and…" before "but…". Objections are noted, not acted on, until the
  user asks for judgment.
- The user steers. You propose branches; they pick. When several branches
  compete, surface the fork with the `question` interaction instead of
  silently choosing one.
- No ceremony. No mandatory phases, no creativity checklist — follow the
  energy of the conversation.

## Divergence toolbox

Pick whatever fits the moment; combine when the idea resists.

- **Analogy transfer** — who else solves this *shape* of problem? Other
  fields, other scales, other substrates.
- **Inversion** — what if the opposite assumption held?
- **Scale shift** — what changes at 1000× the data, parameters, time,
  precision?
- **Constraint removal** — what if X were free, instant, or infinite?
- **Forced combination** — collide the idea with an unrelated mechanism
  and watch what sparks.
- **Naive outsider** — the question a smart non-specialist would ask, that
  insiders stopped asking.
- **Dogma base rate** — the assumptions everyone repeats without citing.
  Openings live there.

## Literature cross-pollination

The goal is collision, not coverage:

- **Same problem, different field** — different tools, different blind
  spots, different vocabulary for the same shape.
- **Contradictions between papers** — a contradiction is an opening.
- **Assumptions stated without argument** — candidates for the idea to
  challenge.

Stage whatever sparks (`literature-stage`) so it can be read later; a spark
hunt is minutes, not a survey. If it starts becoming a survey, say so —
that is a different mode of work.

## The ideas folder

Bold ideas must not evaporate. Ideas live in a dedicated plain folder at
the project root — **`ideas/`** (not app-managed, not inside `specs/`):
the folder itself is the lab shelf, browsable in the file tree.

One small file per idea — `ideas/<date>-<slug>.md`:

```markdown
# <the idea in one line>

Status: parked | warming | converged
Spark: <what triggered it — a paper, a contradiction, a shower thought>

## The idea
…

## Objections noted (parked, not acting)
…
```

Status **parked** is legitimate, not a rejection — parked ideas stay on
the shelf, visible. Objections raised along the way are recorded in the
file but never acted on unless the user picks the idea up.

## Converging — only when the user says so

When an idea pulls hard enough, **offer** the handoffs — never impose them:

- sharpen into a testable claim → `hypothesis-design` when enabled, or
  sharpen inline;
- stress it → `critical-review` when enabled, or a reverse pass inline;
- pressure-test the research question → the `research-design-coach` expert
  when available.

Staying in divergent mode for the whole session is a valid outcome.

## Rules

- Never verdict an early idea. "Interesting because… / dangerous
  because…" beats "feasible / infeasible".
- Every session ends by updating the ideas folder — even if the only new
  file says "parked".
- Literature sparks are staged or filed with their source — no ungrounded
  "the literature says".
- Ideas live in `ideas/`, not in the brief — the brief holds only what has
  settled.

## Done when

- The branches explored are named, and each fork was the user's pick.
- The ideas folder is updated: new sparks filed, parked states honest.
- Any convergence happened by the user's choice, with the handoff named.
