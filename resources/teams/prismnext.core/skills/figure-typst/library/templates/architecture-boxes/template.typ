// Layered boxes. Edit only the #let block (template.meta.json).
// Pin: @preview/cetz:0.3.4 — do not bump.
#import "@preview/cetz:0.3.4": canvas, draw

#let in-label = "Input"
#let a-label = "Block A"
#let b-label = "Block B"
#let out-label = "Output"
#let alt-label = "Block A′"
#let stage-1 = "stage 1"
#let stage-2 = "stage 2"

#set page(width: auto, height: auto, margin: 6pt)
#set text(size: 9pt)

#canvas(length: 1cm, {
  import draw: *

  let io-fill = luma(92%)
  let stage-fill = rgb("#dce8f5")
  let alt-fill = rgb("#f4ebe0")
  let stroke-w = 0.6pt

  rect((0, 0), (2.2, 0.85), name: "in", radius: 0.08, fill: io-fill, stroke: stroke-w)
  content("in", in-label)

  rect((3.1, 0), (5.3, 0.85), name: "a", radius: 0.08, fill: stage-fill, stroke: stroke-w)
  content("a", a-label)

  rect((6.2, 0), (8.4, 0.85), name: "b", radius: 0.08, fill: stage-fill, stroke: stroke-w)
  content("b", b-label)

  rect((9.3, 0), (11.5, 0.85), name: "out", radius: 0.08, fill: io-fill, stroke: stroke-w)
  content("out", out-label)

  rect((3.1, -1.5), (5.3, -0.65), name: "ap", radius: 0.08, fill: alt-fill, stroke: stroke-w)
  content("ap", alt-label)

  line("in.east", "a.west", mark: (end: ">"), stroke: 0.8pt)
  line("a.east", "b.west", mark: (end: ">"), stroke: 0.8pt)
  line("b.east", "out.west", mark: (end: ">"), stroke: 0.8pt)
  line("in.south", "ap.west", mark: (end: ">"), stroke: 0.8pt)
  line("ap.east", "b.south", mark: (end: ">"), stroke: 0.8pt)

  content((4.2, 1.15), text(size: 8pt, fill: luma(40%), style: "italic", stage-1))
  content((7.3, 1.15), text(size: 8pt, fill: luma(40%), style: "italic", stage-2))
})
