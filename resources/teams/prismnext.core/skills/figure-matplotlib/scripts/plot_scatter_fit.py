#!/usr/bin/env python3
"""Named pattern: two-variable scatter plus a claimed linear fit.

Copy this file AND `prism.mplstyle` together. Only draw the fit if the
caption actually claims it. Replace load_data() with paired x, y.

Outputs: <out>/<name>.pdf and .png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with real paired observations."""
    rng = np.random.default_rng(5)
    x = rng.uniform(0.0, 4.0, 90)
    y = 0.65 * x + 0.4 + rng.normal(0.0, 0.35, x.shape)
    return x, y


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-scatter-fit")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    x, y = load_data()
    slope, intercept = np.polyfit(x, y, 1)
    xx = np.linspace(float(np.min(x)), float(np.max(x)), 100)

    fig, ax = plt.subplots()
    ax.scatter(x, y, s=16, alpha=0.75, label="Observed")
    ax.plot(xx, slope * xx + intercept, label="Linear fit")
    ax.set_xlabel("Predicted (a.u.)")
    ax.set_ylabel("Observed (a.u.)")
    ax.legend()

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
