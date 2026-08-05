#!/usr/bin/env python3
"""Publication figure template (matplotlib).

Copy into your island/scripts folder, replace the data section, run via
experiment-run so it executes inside the project venv. The style file ships
with the scientific-visualization skill — adjust STYLE_PATH if you move it.

Outputs: <out>/fig-name.pdf (manuscript) and .png (preview/chat).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with real data loading (from run artifacts, not ad-hoc paths)."""
    x = np.linspace(0, 10, 200)
    series = {
        "Baseline": np.sin(x),
        "Ours": np.sin(x) * 0.8 + 0.2,
    }
    return x, series


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-example")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    x, series = load_data()

    fig, ax = plt.subplots()
    for label, y in series.items():
        ax.plot(x, y, label=label)

    ax.set_xlabel("Time (s)")           # units, always
    ax.set_ylabel("Response (a.u.)")    # units, always
    ax.legend()

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
