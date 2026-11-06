# Bills and subscriptions: the review harness

Written by the reviewer of the bills finder on 2026-11-05 and 06. It's how the ADR 0023 targets were measured at scale. The targets are 97% or more of recurring charges found, 2% or less wrong, and a price change caught on its first changed charge.

- `gen.py` and `gen2.py` generate simulated people with the life simulator (`docs/situations/simulator/`). They're deterministic by seed. The held-out set used seeds 3001 to 3040 (90 days), 3101 to 3130 (200), 3201 to 3230 (365) and 3301 to 3330 (400). Regenerate the people instead of committing them (about 20 MB).
- `score.ts`, `score-tidy.ts` and `score-stale.ts` give found and planted, and wrong and flagged, per history length (with names tidied or not, and with stale series).
- `pushes.ts` and `pushes-prod.ts` replay 60 days of daily runs and count false and real price-rise pushes.
- The `synth*.ts`, `p2p.ts`, `keys.ts`, `dups.ts` and `price.ts` scripts are targeted probes: own-account transfers, card issuers, Venmo shares, second lines, refunds, Apple and Amazon, overdraft fees, and key stability.

**Run them** with tsx, from the repo root, under `NODE_OPTIONS=--conditions=react-server` (the tidy imports `server-only`). Some scripts still have the reviewer's scratch paths at the top; point them at this folder and at a folder of generated people. These files are excluded from typecheck, lint and format.

Last results (2026-11-06):
- held-out: 713/726 found (98.2%), 0/753 wrong;
- acceptance: 733/734 found, 0 wrong;
- 60-day replay: 0 false price-rise pushes, 79 real.
