// ai-btc-race-engine: a washout-bounce bot for the make.fun BTC race.
//
// Idea: Bitcoin falls in sharp washouts and then snaps back. This bot does
// nothing most of the day. It only buys after a real washout, when the price
// has already started to recover, and it rides the recovery with a trailing
// stop. On a slow bleed with no washout it stays in cash: cash earns nothing,
// but a bad long loses money, and this contest is long-only.
//
//   entry (flat, after 120 closes of history):
//     - washout: within the trailing 120 one-minute closes the high-to-low
//       drop is at least 150 bps (1.5% in two hours);
//     - bounce: the latest close is at least 40 bps above the trailing
//       120-close low, on two consecutive closes (one noisy minute alone
//       must not trigger an entry);
//     - then buy with all cash.
//   exit (in a position):
//     - trailing stop: sell everything when the latest close falls more than
//       70 bps below the highest close seen since entry.
//     - no take-profit: cutting the recovery short cost more than it saved
//       on the dev window.
//
// All arithmetic is BigInt on the raw integer prices the harness sends, so
// the bot is exactly deterministic: no floats, no clock, no randomness, no
// environment. The seed from hello is accepted and deliberately unused.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Trailing window for the washout/bounce read, in one-minute bars.
const LOOKBACK_BARS = 120;
// A washout is a high-to-low drop of at least this many bps in the window.
const WASHOUT_BPS = 150;
// A bounce is a close at least this many bps above the window low.
const BOUNCE_BPS = 40;
// The bounce must hold for this many consecutive closes before buying.
const BOUNCE_CONFIRM_BARS = 2;
// The trailing stop trails the peak close since entry by this many bps.
const TRAIL_BPS = 70;
// Max slippage a fill may move from the latest close, in bps. Wide enough
// that a sharp recovery open does not reject the entry; tight enough that a
// violent gap is not chased.
const MAX_SLIPPAGE_BPS = 150;

// All closes seen so far, as raw integer prices (price_scale 5).
const closes: bigint[] = [];
// Highest close since the current position was opened (null when flat).
let peakSinceEntry: bigint | null = null;
// Consecutive closes the entry setup has held for (reset by any close
// that breaks it, and by a filled buy).
let setupStreak = 0;

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar !== undefined) {
    closes.push(BigInt(bar.c));
  }
  if (state.warmingUp) {
    return [];
  }
  const close = state.close(SYMBOL);
  if (close === null) {
    return [];
  }
  const position = state.positions.get(SYMBOL);
  const holding = position !== undefined && position.qty > 0n;

  if (!holding) {
    if (closes.length < LOOKBACK_BARS) {
      return [];
    }
    const window = closes.slice(-LOOKBACK_BARS);
    let low = window[0]!;
    let high = window[0]!;
    for (const c of window) {
      if (c < low) low = c;
      if (c > high) high = c;
    }
    // Washout: (high - low) / high >= 150 bps, in exact integer math.
    const washout = (high - low) * 10000n >= BigInt(WASHOUT_BPS) * high;
    // Bounce: close / low >= 1 + 40 bps, in exact integer math.
    const bounced = close * 10000n > low * BigInt(10000 + BOUNCE_BPS);
    if (washout && bounced) {
      setupStreak += 1;
    } else {
      setupStreak = 0;
    }
    if (setupStreak >= BOUNCE_CONFIRM_BARS && state.cash > 0n) {
      peakSinceEntry = close;
      setupStreak = 0;
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  }

  // In a position: trail the peak close since entry.
  if (peakSinceEntry === null || close > peakSinceEntry) {
    peakSinceEntry = close;
  }
  const fell = (peakSinceEntry - close) * 10000n > BigInt(TRAIL_BPS) * peakSinceEntry;
  if (fell) {
    peakSinceEntry = null;
    return [
      {
        side: 'sell',
        symbol: SYMBOL,
        qty: position.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      },
    ];
  }
  return [];
}

await runBars({ onBatch });
