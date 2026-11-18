[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/arisasmara/ai-btc-race-engine/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/arisasmara/ai-btc-race-engine/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

# ai-btc-race-engine

Autonomous trading bot for the make.fun BTC race — paper-trades cbBTC/USDC on 1-minute on-chain bars.

Entry for [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261118-1444): a bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, with $1,000 of paper money. Nothing is traded for real.

## Strategy: washout bounce

Bitcoin falls in sharp washouts and then snaps back. This bot does nothing most of the day. It only buys after a real washout, when the price has already started to recover, and rides the recovery with a trailing stop. On a slow bleed with no washout it stays in cash: cash earns nothing, but a bad long loses money, and this contest is long-only.

- **Entry** (flat, after 120 closes of history): within the trailing 120 one-minute closes the high-to-low drop is at least 150 bps (1.5% in two hours), and the latest close is at least 40 bps above the trailing 120-close low, on two consecutive closes (one noisy minute alone must not trigger an entry). Then it buys with all cash.
- **Exit** (in a position): sell everything when the latest close falls more than 70 bps below the highest close seen since entry. No take-profit: cutting the recovery short cost more than it saved on the dev window.

## Implementation

- `main.ts` — the bot. Node 22, standard library only, speaks `agent-fun/bars-replay/v1` through the kit's SDK shim in `vendor/makefun-bars.ts` (copied byte-for-byte from the kit).
- All arithmetic is `BigInt` on the raw integer prices the harness sends, so the bot is exactly deterministic: no floats, no clock, no randomness, no environment, no network. Two runs on the same data produce byte-identical action logs.

## Dev-window result

Graded locally with the kit's `grade-local` on the frozen 24-hour dev window (1,440 one-minute bars):

- Net PnL: **+$10.80** on $1,000 paper (1.08%)
- Trades: 2 (one round trip: buy after the washout, sell on the trailing stop)
- Max drawdown: 0.90% (guardrail: 25%)
- Net PnL with fees doubled: +$9.99
- Determinism: the two graded runs reproduced byte for byte

The dev gate requires a net PnL above $0 after all fees, so this entry races.
