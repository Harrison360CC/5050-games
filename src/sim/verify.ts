import type { Replay, Sim } from "./types";
import { pigeonSim } from "./pigeon";
import { rentSim } from "./rent";
import { slumlordSim } from "./slumlord";

export const SIMS: Record<string, Sim<any>> = {
  pigeon: pigeonSim,
  rent: rentSim,
  slumlord: slumlordSim,
};

export type VerifyResult =
  | { ok: true; score: number; ticks: number }
  | { ok: false; reason: string };

/** Hard limits. Anything outside these is rejected before we even replay. */
const MAX_TICKS = 60 * 60 * 20; // 20 minutes at 60Hz
const MAX_TAPS = 20_000;
/** Two taps closer than this (in ticks) is faster than any human. 60Hz, so 4 ticks = 66ms. */
const MIN_TAP_GAP = 4;

/**
 * Replay a run server-side and compute the score from scratch.
 * The client's claimed score is never an input here.
 */
export function verify(replay: Replay): VerifyResult {
  const sim = SIMS[replay.game];
  if (!sim) return { ok: false, reason: "unknown game" };
  if (replay.version !== sim.version) return { ok: false, reason: "sim version mismatch" };
  if (!Number.isInteger(replay.seed)) return { ok: false, reason: "bad seed" };
  if (!Number.isInteger(replay.endTick) || replay.endTick < 1 || replay.endTick > MAX_TICKS)
    return { ok: false, reason: "bad endTick" };
  if (!Array.isArray(replay.taps) || replay.taps.length > MAX_TAPS)
    return { ok: false, reason: "bad taps" };

  let prev = -Infinity;
  for (const t of replay.taps) {
    if (!Number.isInteger(t) || t < 0 || t > replay.endTick) return { ok: false, reason: "tap out of range" };
    if (t <= prev) return { ok: false, reason: "taps not increasing" };
    if (t - prev < MIN_TAP_GAP) return { ok: false, reason: "inhuman tap rate" };
    prev = t;
  }

  const state = sim.init(replay.seed);
  const taps = new Set(replay.taps);
  for (let tick = 1; tick <= replay.endTick; tick++) {
    sim.step(state, taps.has(tick));
    if (sim.isDead(state)) {
      if (tick !== replay.endTick) return { ok: false, reason: `died at ${tick}, claimed ${replay.endTick}` };
      return { ok: true, score: sim.score(state), ticks: tick };
    }
  }
  // Run claims to have ended but the sim says the player is still alive.
  return { ok: false, reason: "run did not end" };
}
