#!/usr/bin/env python3
"""Named pattern: ROC and precision-recall from scores and binary labels.

Copy this file AND `prism.mplstyle` together. Replace load_data() with
y_true (0/1) and y_score (higher = more positive). Thresholds are swept
in the script — do not paste a curve from memory.

Outputs: <out>/<name>.pdf and .png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

STYLE_PATH = Path(__file__).resolve().parent / "prism.mplstyle"


def load_data():
    """Replace with real labels and decision scores."""
    rng = np.random.default_rng(2)
    y_true = rng.integers(0, 2, 400)
    y_score = y_true * 1.4 + rng.normal(0.0, 1.0, y_true.shape)
    return y_true.astype(int), y_score


def _binary_curves(y_true: np.ndarray, y_score: np.ndarray):
    order = np.argsort(-y_score)
    y = y_true[order]
    tp = np.cumsum(y)
    fp = np.cumsum(1 - y)
    p = int(tp[-1])
    n = int(fp[-1])
    tpr = tp / max(p, 1)
    fpr = fp / max(n, 1)
    prec = tp / np.maximum(tp + fp, 1)
    rec = tpr
    # prepend the (0,0) / (1,0) anchors used by ROC / PR
    fpr = np.concatenate(([0.0], fpr))
    tpr = np.concatenate(([0.0], tpr))
    prec = np.concatenate(([1.0], prec))
    rec = np.concatenate(([0.0], rec))
    return fpr, tpr, rec, prec


def _auc(x: np.ndarray, y: np.ndarray) -> float:
    trap = getattr(np, "trapezoid", np.trapz)
    return float(trap(y, x))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("figures"))
    ap.add_argument("--name", default="fig-roc-pr")
    ap.add_argument("--style", type=Path, default=STYLE_PATH)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    plt.style.use(str(args.style))

    y_true, y_score = load_data()
    fpr, tpr, rec, prec = _binary_curves(y_true, y_score)

    fig, (ax_roc, ax_pr) = plt.subplots(1, 2, figsize=(7.2, 2.8), constrained_layout=True)
    ax_roc.plot(fpr, tpr, label=f"AUC { _auc(fpr, tpr):.2f}")
    ax_roc.plot([0, 1], [0, 1], linestyle="--", color="0.5", linewidth=0.8)
    ax_roc.set_xlabel("False positive rate")
    ax_roc.set_ylabel("True positive rate")
    ax_roc.set_xlim(0, 1)
    ax_roc.set_ylim(0, 1)
    ax_roc.legend()

    ax_pr.plot(rec, prec, label=f"AUC { _auc(rec, prec):.2f}")
    ax_pr.set_xlabel("Recall")
    ax_pr.set_ylabel("Precision")
    ax_pr.set_xlim(0, 1)
    ax_pr.set_ylim(0, 1)
    ax_pr.legend()

    for letter, ax in zip("ab", (ax_roc, ax_pr)):
        ax.text(-0.18, 1.05, letter, transform=ax.transAxes, fontweight="bold", fontsize=9)

    pdf = args.out / f"{args.name}.pdf"
    png = args.out / f"{args.name}.png"
    fig.savefig(pdf)
    fig.savefig(png)
    print(f"wrote {pdf} and {png}")


if __name__ == "__main__":
    main()
