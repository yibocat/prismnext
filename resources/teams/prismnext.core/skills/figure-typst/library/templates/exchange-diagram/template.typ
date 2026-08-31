// Exchange diagram. Edit only the #let block (template.meta.json).
// Pin: @preview/fletcher:0.5.8 (pulls cetz:0.3.4) — do not bump.
#import "@preview/fletcher:0.5.8": diagram, node, edge

#let left-label = [A]
#let right-label = [B]
#let mid-label = [C]
#let top-arrow = [$f$]
#let left-arrow = [$g$]
#let right-arrow = [$h$]

#set page(width: auto, height: auto, margin: 8pt)
#set text(size: 10pt)

#diagram(
  node-stroke: 0.7pt,
  node-inset: 6pt,
  spacing: 2.4em,
  node((0, 0), left-label, name: <a>),
  node((2, 0), right-label, name: <b>),
  node((1, -1.2), mid-label, name: <c>),
  edge(<a>, <b>, "->", top-arrow),
  edge(<a>, <c>, "->", left-arrow),
  edge(<b>, <c>, "->", right-arrow),
)
