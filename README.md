[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/YUSUFID2/token-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/YUSUFID2/token-radar/reward.svg)](https://make.fun/c/token-radar-01)

# Token Radar — radar-2

Which pre-token protocol is worth farming next — ranked by what its launch would be worth.

This entry reads a sealed DefiLlama snapshot (758 protocols, as of 2026-11-14, watchlist floor
$50M), scores every pre-token protocol with one model, and renders a dark, filterable dashboard:
a 300-row board, a detail view with a model breakdown and a 6-step farm plan per protocol, a
separate live-token view, and a model sandbox that re-ranks the board live.

## Why this radar beats the plain starter

The starter's rankable rule only excludes CEX and versioned names, so its early rows include
wrapped and staked products of tokens that already trade (WBTC, Binance staked ETH, …) — exactly
what the bounty penalises. **radar-2 applies the full watchlist rule to every rankable row**:
pre-token only, no CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking /
Restaked BTC, no whole-word wrapped/staked/staking in the name, no exchange-prefixed name, no
versioned name. Farm plans are category- and chain-specific with real gas costs, not generic.

## The model (radar-2)

```
implied = TVL x 0.25 x growth x maturity x category x chain x likelihood
```

- `growth` = 1 + clamp(7d change, −60%, +120%) / 100 × 0.5
- `maturity` = 0.6 + min(age_days, 1095) / 1095 × 0.4 (age = days since first listing)
- `category`: Risk Curators 1.25, Onchain Capital Allocator 1.20, Derivatives 1.15, Dexs 1.10,
  Lending 1.05, CDP 1.00, RWA 0.95, Yield 0.90, Yield Aggregator 0.85, Payments 0.80, other 1.00
- `chain` = 1 + 0.02 × min(chains − 1, 5), max 1.10
- `likelihood` = 0.70 + 0.10 (age ≥ 365d) + 0.10 (growth > 0) + 0.10 (fee-generating category),
  clamped to 0.40–1.00

Board: all 40 watchlist protocols + the top 260 rankable protocols below the floor by TVL =
**300 rows**, sorted by implied value, ties broken by slug. The top 24 protocols by market cap
are shown separately as live tokens — the market's own values, not a model's.

"No token" means a protocol *records* no token in the snapshot — never a claim that it has none.
Implied values are this radar's own estimates, not investment advice.

## Run it

Requires Node.js 22.18+ and nothing else (standard library only, no network at run time).

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
# then open out/dashboard/index.html (served, e.g. python3 -m http.server in out/)
```

`main.ts` writes `board.json`, `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored make.fun library. Running it twice produces byte-identical
output (no clock, no randomness, every sort has a slug tie-break).

## Layout

- `main.ts` — entrypoint: read snapshot → build board → write outputs
- `lib/model.ts` — the radar-2 model, farm plans, and the `RadarData` shape
- `dashboard/` — the page: `index.html`, `app.css`, `app.js` (≤ 60,000 bytes combined, no network;
  verified by byte count and a grep for `http://` / `https://` before every hand-in)
- `screenshots/` — board, detail, and filtered views of the real rendered dashboard
- `vendor/makefun-board.ts` — vendored make.fun dossier library (do not edit)

## Verify locally

```sh
wc -c dashboard/index.html dashboard/app.css dashboard/app.js   # total must stay <= 60,000
grep -r "http://" dashboard/ ; grep -r "https://" dashboard/    # both must print nothing
node --check dashboard/app.js
```

Render check: serve the generated output (`python3 -m http.server` in the output dir)
and open `dashboard/index.html` in a browser with the network off — the board, detail view,
live tab and sandbox must all work from `data.js` alone.

## Referral

Built with an uncensored model — superbot.gg. Try make.fun yourself:
https://make.fun/r/k62ycwh7
