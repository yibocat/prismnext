#!/usr/bin/env python3
"""Power / sample-size calculator (stdlib only).

Normal-approximation planning numbers for the three most common cases.
Approximations are fine for design decisions; if the result is borderline,
simulate instead of arguing about the second decimal.

Scope: two-sample t, two proportions, correlation. Anything else (e.g.
seed planning for ML method comparisons) is a simulation question — do
not force these formulas onto designs they do not cover.

Usage:
  python power_analysis.py ttest --effect 0.5 --alpha 0.05 --power 0.8
  python power_analysis.py ttest --n 64 --effect 0.5 --alpha 0.05
  python power_analysis.py proportion --p1 0.50 --p2 0.60 --alpha 0.05 --power 0.8
  python power_analysis.py correlation --r 0.3 --alpha 0.05 --power 0.8
"""

from __future__ import annotations

import argparse
import math


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def norm_ppf(p: float) -> float:
    """Inverse standard normal CDF (Acklam's rational approximation)."""
    if not 0.0 < p < 1.0:
        raise ValueError("p must be in (0, 1)")
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02,
         1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02,
         6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00,
         -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00,
         3.754408661907416e00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / \
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


def ttest_n_per_group(effect: float, alpha: float, power: float, two_sided: bool) -> float:
    z_a = norm_ppf(1 - alpha / 2 if two_sided else 1 - alpha)
    z_b = norm_ppf(power)
    return 2.0 * ((z_a + z_b) / effect) ** 2


def ttest_power(n: float, effect: float, alpha: float, two_sided: bool) -> float:
    z_a = norm_ppf(1 - alpha / 2 if two_sided else 1 - alpha)
    return norm_cdf(effect * math.sqrt(n / 2.0) - z_a)


def proportion_n_per_group(p1: float, p2: float, alpha: float, power: float) -> float:
    z_a = norm_ppf(1 - alpha / 2)
    z_b = norm_ppf(power)
    pbar = (p1 + p2) / 2.0
    num = (z_a * math.sqrt(2 * pbar * (1 - pbar))
           + z_b * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return num / (p2 - p1) ** 2


def correlation_n(r: float, alpha: float, power: float) -> float:
    z_a = norm_ppf(1 - alpha / 2)
    z_b = norm_ppf(power)
    zr = 0.5 * math.log((1 + r) / (1 - r))  # Fisher z
    return ((z_a + z_b) / zr) ** 2 + 3.0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="mode", required=True)

    t = sub.add_parser("ttest", help="two-sample t-test (normal approx)")
    t.add_argument("--effect", type=float, required=True, help="Cohen's d")
    t.add_argument("--alpha", type=float, default=0.05)
    t.add_argument("--power", type=float, default=0.8)
    t.add_argument("--n", type=float, default=None, help="n per group → solve for power instead")
    t.add_argument("--one-sided", action="store_true")

    p = sub.add_parser("proportion", help="two independent proportions")
    p.add_argument("--p1", type=float, required=True)
    p.add_argument("--p2", type=float, required=True)
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--power", type=float, default=0.8)

    c = sub.add_parser("correlation", help="Pearson r ≠ 0")
    c.add_argument("--r", type=float, required=True)
    c.add_argument("--alpha", type=float, default=0.05)
    c.add_argument("--power", type=float, default=0.8)

    args = ap.parse_args()

    if args.mode == "ttest":
        two_sided = not args.one_sided
        if args.n is not None:
            pw = ttest_power(args.n, args.effect, args.alpha, two_sided)
            print(f"n/group={args.n:g}, d={args.effect:g}, alpha={args.alpha:g} "
                  f"({'two' if two_sided else 'one'}-sided) → power = {pw:.3f}")
        else:
            n = ttest_n_per_group(args.effect, args.alpha, args.power, two_sided)
            print(f"d={args.effect:g}, alpha={args.alpha:g} "
                  f"({'two' if two_sided else 'one'}-sided), power={args.power:g} "
                  f"→ n per group = {math.ceil(n)} (raw {n:.1f}; total {2 * math.ceil(n)})")
    elif args.mode == "proportion":
        n = proportion_n_per_group(args.p1, args.p2, args.alpha, args.power)
        print(f"p1={args.p1:g}, p2={args.p2:g}, alpha={args.alpha:g}, power={args.power:g} "
              f"→ n per group = {math.ceil(n)} (raw {n:.1f})")
    else:
        n = correlation_n(args.r, args.alpha, args.power)
        print(f"r={args.r:g}, alpha={args.alpha:g}, power={args.power:g} "
              f"→ total n = {math.ceil(n)} (raw {n:.1f})")


if __name__ == "__main__":
    main()
