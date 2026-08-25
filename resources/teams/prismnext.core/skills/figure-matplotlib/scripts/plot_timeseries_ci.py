#!/usr/bin/env python3
"""Named pattern: trend over ordered x, with a named interval band.

Copy this file AND `prism.mplstyle` together. Replace load_data() with a
run artifact (mean + interval of the same length). Caption must name the
interval (95% CI, SD, …) and n.

Outputs: <out>/<name>.pdf and .png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with real series. Each value is (mean, lo, hi)."""
    x = np.linspace(0, 20, 80)
    rng = np.random.default_rng(0)
    series = {}
    for i, label in enumerate(("Baseline", "Ours")):
        mean = np.sin(x / 3 + i) * (0.7 + 0.2 * i) + 0.15 * i
        noise = 0.12 + 0.04 * i + 0.03 * rng.random(mean.shape)
        series[label] = (mean, mean - noise, mean + noise)
    return x, series


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-timeseries-ci")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    x, series = load_data()
    fig, ax = plt.subplots()
    for label, (mean, lo, hi) in series.items():
        line, = ax.plot(x, mean, label=label)
        ax.fill_between(x, lo, hi, color=line.get_color(), alpha=0.22, linewidth=0)

    ax.set_xlabel("Step")
    ax.set_ylabel("Accuracy")
    ax.legend()

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
