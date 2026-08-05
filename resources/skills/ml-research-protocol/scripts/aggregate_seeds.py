#!/usr/bin/env python3
"""aggregate_seeds.py — per-seed metrics CSV -> stats + LaTeX table rows.

Stdlib only. Usage:

    python aggregate_seeds.py results.csv --metric score --higher-better
    python aggregate_seeds.py results.csv --metric loss   # lower is better

CSV format (one row per run):

    method,seed,score
    baseline,1,84.12
    ours,1,85.03
    ...

Output: per-method n / mean / std / 95% CI (t-based, small-sample exact),
then LaTeX booktabs rows with the best method bolded ONLY when its CI does
not overlap the runner-up's (the bold-best rule — see
references/baselines-and-ablations.md).
"""

import argparse
import csv
import math
import sys
from collections import OrderedDict

# t critical values, two-sided 95%, df 1..30 (df>30 -> 1.96 normal approx)
T_CRIT_95 = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
    2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
    2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
]


def t_crit(df: int) -> float:
    if df < 1:
        return float("nan")
    return T_CRIT_95[df - 1] if df <= 30 else 1.96


def stats(values: list[float]) -> tuple[int, float, float, float]:
    n = len(values)
    mean = sum(values) / n
    if n < 2:
        return n, mean, float("nan"), float("nan")
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    std = math.sqrt(var)
    ci = t_crit(n - 1) * std / math.sqrt(n)
    return n, mean, std, ci


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--metric", required=True, help="metric column name")
    ap.add_argument("--higher-better", action="store_true")
    ap.add_argument("--digits", type=int, default=2)
    args = ap.parse_args()

    per_method: "OrderedDict[str, list[float]]" = OrderedDict()
    with open(args.csv_path, newline="") as fh:
        reader = csv.DictReader(fh)
        if args.metric not in (reader.fieldnames or []):
            sys.exit(f"column {args.metric!r} not in {reader.fieldnames}")
        for row in reader:
            per_method.setdefault(row["method"], []).append(float(row[args.metric]))

    if len(per_method) < 1:
        sys.exit("no rows")

    table = []
    for method, values in per_method.items():
        n, mean, std, ci = stats(values)
        table.append((method, n, mean, std, ci))

    d = args.digits
    print(f"{'method':<20} {'n':>3} {'mean':>10} {'std':>10} {'95% CI':>10}")
    for method, n, mean, std, ci in table:
        ci_s = f"{ci:.{d}f}" if not math.isnan(ci) else "—"
        std_s = f"{std:.{d}f}" if not math.isnan(std) else "—"
        print(f"{method:<20} {n:>3} {mean:>10.{d}f} {std_s:>10} {ci_s:>10}")

    # Bold-best rule: best mean whose CI excludes the runner-up's mean.
    key = (lambda r: r[2]) if args.higher_better else (lambda r: -r[2])
    ranked = sorted(table, key=key, reverse=True)
    best, second = ranked[0], ranked[1] if len(ranked) > 1 else None
    bold = best[0]
    if second and not math.isnan(best[4]) and not math.isnan(second[4]):
        lo = best[2] - best[4]
        hi = best[2] + best[4]
        separated = not (lo <= second[2] <= hi)
        if not separated:
            bold = None
    elif best[3] != best[3]:  # single run, no std
        bold = None

    if bold is None:
        print("\nNOTE: top methods' CIs overlap — bold neither (see bold-best rule).")
    print("\n% LaTeX rows (booktabs):")
    for method, n, mean, std, ci in table:
        cell = f"{mean:.{d}f}"
        if not math.isnan(std):
            cell += rf" {{\scriptsize$\pm$\,{std:.{d}f}}}"
        if method == bold:
            cell = f"\\textbf{{{cell}}}"
        print(f"{method} & {cell} \\\\")

    return 0


if __name__ == "__main__":
    sys.exit(main())
