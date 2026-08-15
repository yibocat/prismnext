# Results Block Template

Every quantitative claim in a Results section carries the full block. If any
element is missing, the claim is not ready.

## Per-claim block

```
[Claim sentence with direction and magnitude.]
 test: <name, exact variant>        statistic = <value>, df = <…>
 p = <exact value, or p < 0.001>    effect size = <g / r / RD …> [95% CI …, …]
 n = <per group>, assumptions: <what was checked + outcome>
 correction: <none / Holm / BH(q=…)> — family of <m> tests
```

## Example (filled)

```
Method A reduced latency versus the matched baseline.
 test: Welch two-sample t-test      t(47.8) = 3.21
 p = 0.0024                         Hedges' g = 0.62 [95% CI 0.23, 1.01]
 n = 32/32, assumptions: residual Q–Q plot unremarkable; Welch used (no equal-variance assumption)
 correction: Holm across the 3 primary endpoints
```

## Rules

- Report exact p to 2–3 significant digits unless below 0.001.
- "Trending toward significance" is not a result; report the numbers and stop.
- Negative results get the same full block.
- If any assumption check failed, the test named must be the fallback you
  actually ran — not the one you wished for.
