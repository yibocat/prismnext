#!/usr/bin/env python3
"""simulate_did.py — minimal difference-in-differences simulator (stdlib only).

Generates a two-group panel with a known treatment effect, estimates the
2x2 DiD, and checks pre-trends. Use it to sanity-check a design, to teach
the logic, or as the skeleton for power simulations (loop over effect
sizes and N, then feed a power analysis — e.g. `statistical-rigor`'s
script when that skill is available).

    python simulate_did.py --tau 2.0 --n 200 --periods 6 --treat-at 4
"""

import argparse
import random
import statistics


def generate(n: int, periods: int, treat_at: int, tau: float, seed: int):
    rng = random.Random(seed)
    rows = []  # (unit, t, treated_group, post, y)
    for i in range(2 * n):
        treated = 1 if i < n else 0
        unit_fe = rng.gauss(0.0, 1.0)
        drift = 0.3 * treated  # group-level level difference, NOT a trend
        for t in range(periods):
            time_fe = 0.5 * t  # common trend — parallel by construction
            d = treated if t >= treat_at else 0
            y = 10.0 + unit_fe + drift + time_fe + tau * d + rng.gauss(0.0, 1.0)
            rows.append((i, t, treated, 1 if t >= treat_at else 0, y))
    return rows


def group_mean(rows, treated: int, post: int) -> float:
    vals = [y for (_i, _t, tr, po, y) in rows if tr == treated and po == post]
    return statistics.mean(vals)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tau", type=float, default=2.0, help="true effect")
    ap.add_argument("--n", type=int, default=200, help="units per group")
    ap.add_argument("--periods", type=int, default=6)
    ap.add_argument("--treat-at", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    rows = generate(args.n, args.periods, args.treat_at, args.tau, args.seed)

    did = (group_mean(rows, 1, 1) - group_mean(rows, 1, 0)) - (
        group_mean(rows, 0, 1) - group_mean(rows, 0, 0)
    )
    print(f"true effect        tau = {args.tau:.3f}")
    print(f"2x2 DiD estimate        = {did:.3f}")
    print(f"estimation error        = {did - args.tau:+.3f}")

    # Pre-trend check: group difference in each pre period should hover at a
    # CONSTANT level (here: the 0.3 drift), not grow/shrink over time.
    print("\npre-trend check (treated minus control, per pre period):")
    pre_diffs = []
    for t in range(args.treat_at):
        dt = statistics.mean(y for (_i, tt, tr, _p, y) in rows if tr == 1 and tt == t)
        dc = statistics.mean(y for (_i, tt, tr, _p, y) in rows if tr == 0 and tt == t)
        pre_diffs.append(dt - dc)
        print(f"  t={t}: {dt - dc:+.3f}")
    slope = (pre_diffs[-1] - pre_diffs[0]) / max(1, len(pre_diffs) - 1)
    print(f"  rough slope over pre periods: {slope:+.3f}  (want ~0; the level "
          f"may be nonzero — levels do not violate DiD, trends do)")

    ok = abs(did - args.tau) < 0.5 and abs(slope) < 0.2
    print(f"\n{'PASS' if ok else 'CHECK'}: design recovers the effect")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
