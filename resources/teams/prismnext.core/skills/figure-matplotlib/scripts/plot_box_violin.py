#!/usr/bin/env python3
"""Named pattern: group comparison via violin + box (distributions, not means).

Copy this file AND `prism.mplstyle` together. Replace load_data() with one
1-D array per group. Do not replace this with dynamite (mean+SEM) bars.

Outputs: <out>/<name>.pdf and .png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with real per-group observations."""
    rng = np.random.default_rng(3)
    return {
        "Control": rng.normal(0.0, 1.0, 80),
        "A": rng.normal(0.35, 0.9, 80),
        "B": rng.normal(0.8, 1.15, 80),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-box-violin")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    groups = load_data()
    labels = list(groups)
    values = [groups[k] for k in labels]
    positions = np.arange(1, len(labels) + 1)
    cycle = plt.rcParams["axes.prop_cycle"].by_key()["color"]

    fig, ax = plt.subplots()
    parts = ax.violinplot(values, positions=positions, showextrema=False, widths=0.7)
    for i, body in enumerate(parts["bodies"]):
        body.set_facecolor(cycle[i % len(cycle)])
        body.set_alpha(0.35)
        body.set_edgecolor(cycle[i % len(cycle)])

    ax.boxplot(
        values,
        positions=positions,
        widths=0.18,
        showfliers=False,
        medianprops={"color": "black", "linewidth": 1.2},
        boxprops={"color": "black", "linewidth": 0.8},
        whiskerprops={"color": "black", "linewidth": 0.8},
        capprops={"color": "black", "linewidth": 0.8},
    )
    ax.set_xticks(positions, labels)
    ax.set_xlabel("Condition")
    ax.set_ylabel("Residual")

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
