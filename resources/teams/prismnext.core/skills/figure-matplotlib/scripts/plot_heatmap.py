#!/usr/bin/env python3
"""Named pattern: matrix / pairwise structure with a stated color scale.

Copy this file AND `prism.mplstyle` together. Sequential data → cividis;
centered / signed data → RdBu_r and say the center in the caption. Never jet.

Outputs: <out>/<name>.pdf and .png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with a real 2-D array and tick labels."""
    rng = np.random.default_rng(11)
    labels = [f"$x_{{{i}}}$" for i in range(8)]
    raw = rng.normal(0.0, 1.0, size=(8, 8))
    matrix = (raw + raw.T) / 2
    np.fill_diagonal(matrix, 1.0)
    return matrix, labels


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-heatmap")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    matrix, labels = load_data()
    fig, ax = plt.subplots()
    vmax = float(np.max(np.abs(matrix)))
    im = ax.imshow(matrix, cmap="RdBu_r", vmin=-vmax, vmax=vmax, aspect="equal")
    ax.set_xticks(range(len(labels)), labels)
    ax.set_yticks(range(len(labels)), labels)
    ax.set_xlabel("Variable $j$")
    ax.set_ylabel("Variable $i$")
    fig.colorbar(im, ax=ax, shrink=0.85, label="Correlation")

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
