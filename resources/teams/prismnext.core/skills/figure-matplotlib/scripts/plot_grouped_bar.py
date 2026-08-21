#!/usr/bin/env python3
"""Named pattern: grouped bars with explicit y-error.

Copy this file AND `prism.mplstyle` together. Bars start at zero. Caption
must name the error (95% CI / SD / SEM) and n per group.

Outputs: <out>/<name>.pdf and .png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with real means and errors. Shape: categories × series."""
    categories = ["A", "B", "C", "D"]
    series = {
        "Baseline": (np.array([0.62, 0.55, 0.71, 0.48]), np.array([0.04, 0.05, 0.03, 0.06])),
        "Ours": (np.array([0.74, 0.69, 0.80, 0.61]), np.array([0.03, 0.04, 0.03, 0.05])),
    }
    return categories, series


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-grouped-bar")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    categories, series = load_data()
    n_cat = len(categories)
    n_ser = len(series)
    width = min(0.8 / n_ser, 0.28)
    x = np.arange(n_cat)

    fig, ax = plt.subplots()
    for i, (label, (means, errors)) in enumerate(series.items()):
        offset = (i - (n_ser - 1) / 2) * width
        ax.bar(x + offset, means, width, yerr=errors, capsize=3, label=label)

    ax.set_xticks(x, categories)
    ax.set_xlabel("Setting")
    ax.set_ylabel("Score")
    ax.set_ylim(0, None)
    ax.legend()

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
