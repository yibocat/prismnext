#!/usr/bin/env python3
"""Multi-panel publication figure template (matplotlib).

Copy this file AND `prism.mplstyle` together into your island/scripts folder,
replace the demo data in each panel function, run via experiment-run. Panels
share one style, one color cycle, and one save call — a figure is regenerated
end-to-end or not at all.

Layout conventions (see references/journal-sizing.md):
  - Figure width set in mm/inches for the target column, never "looks about
    right" — PANEL_W below is the single-column default (89 mm ≈ 3.5 in).
  - Panel letters a/b/c/… are bold, top-left, outside the axes.
  - Shared colorbar lives on the grid, not inside a panel.

Outputs: <out>/fig-name.pdf (manuscript) and .png (preview/chat).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"

MM_TO_INCH = 1.0 / 25.4
PANEL_W = 89 * MM_TO_INCH   # single column (Nature/IEEE); 183 mm for double
PANEL_H = 2.6               # total figure height in inches — tune per content


# ── Demo data: replace each loader with real run artifacts ────────────────

def panel_a_data():
    x = np.linspace(0, 10, 200)
    return x, {"Baseline": np.sin(x), "Ours": np.sin(x) * 0.8 + 0.2}


def panel_b_data():
    rng = np.random.default_rng(7)
    return rng.normal(0.0, 1.0, 400), rng.normal(0.4, 1.1, 400)


def panel_c_data():
    rng = np.random.default_rng(11)
    return rng.uniform(-1, 1, size=(12, 12))


def panel_d_data():
    x = np.linspace(0, 4 * np.pi, 100)
    return x, np.exp(-x / 8) * np.cos(x), np.exp(-x / 8)


# ── Panels ─────────────────────────────────────────────────────────────────

def draw_panel_a(ax):
    x, series = panel_a_data()
    for label, y in series.items():
        ax.plot(x, y, label=label)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Response (a.u.)")
    ax.legend()


def draw_panel_b(ax):
    a, b = panel_b_data()
    ax.hist(a, bins=24, alpha=0.7, label="Control")
    ax.hist(b, bins=24, alpha=0.7, label="Treatment")
    ax.set_xlabel("Residual")
    ax.set_ylabel("Count")
    ax.legend()


def draw_panel_c(ax):
    m = panel_c_data()
    im = ax.imshow(m, cmap="viridis", aspect="equal")
    ax.set_xlabel("Unit $j$")
    ax.set_ylabel("Unit $i$")
    return im  # shared colorbar target


def draw_panel_d(ax):
    x, y, env = panel_d_data()
    ax.plot(x, y, label="Signal")
    ax.plot(x, env, linestyle="--", label="Envelope")
    ax.set_xlabel("Phase (rad)")
    ax.set_ylabel("Amplitude")
    ax.legend()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-multipanel")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    fig, axes = plt.subplots(
        2, 2,
        figsize=(PANEL_W * 2 + 0.9, PANEL_H * 2),  # two columns + colorbar gutter
        constrained_layout=True,
    )
    (ax_a, ax_b), (ax_c, ax_d) = axes

    draw_panel_a(ax_a)
    draw_panel_b(ax_b)
    im = draw_panel_c(ax_c)
    draw_panel_d(ax_d)

    # Panel letters: bold, top-left, outside the axes frame.
    for letter, ax in zip("abcd", axes.flat):
        ax.text(
            -0.18, 1.05, letter,
            transform=ax.transAxes,
            fontweight="bold",
            fontsize=9,
            va="bottom", ha="left",
        )

    # One shared colorbar for panel c — sized to the panel, not bolted on.
    fig.colorbar(im, ax=ax_c, shrink=0.85, pad=0.02, label="Weight")

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
