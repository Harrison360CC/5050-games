import { Rng } from "./rng";
import type { Sim } from "./types";

/**
 * Slumlord. A floor slides left-right; tap to drop it on the stack. Overhang is
 * sheared off, so the tower narrows. Perfect drop (within PERFECT px) keeps the
 * width and the inspector gives a thumbs up. Score = floors landed.
 * World 360x640. Tower grows upward; camera offset is derived from floors.
 */

export const SL_W = 360;
export const SL_H = 640;
export const FLOOR_H = 22;
export const BASE_W = 160;
const PERFECT = 4;
const MIN_W = 6;

export const VIOLATIONS = [
  "no fire exit", "load-bearing drywall", "raccoon tenant", "mystery stain", "wifi is a rumour",
  "asbestos chic", "one outlet", "the lease is vibes", "heat: ask neighbour", "exposed everything",
  "door is decorative", "mould (feature)", "stairs optional", "inspector bribed", "plumbing: no",
];

export interface Floor { x: number; w: number; v: number; perfect: boolean }

export interface SlumlordState {
  rng: Rng;
  tick: number;
  floors: Floor[];     // landed floors, bottom first
  cur: { x: number; w: number; dir: 1 | -1; speed: number; v: number };
  dead: boolean;
  perfectStreak: number;
}

export const slumlordSim: Sim<SlumlordState> = {
  id: "slumlord",
  version: 1,
  tickRate: 60,

  init(seed) {
    const rng = new Rng(seed);
    const base: Floor = { x: (SL_W - BASE_W) / 2, w: BASE_W, v: -1, perfect: false };
    return { rng, tick: 0, floors: [base], cur: { x: 0, w: BASE_W, dir: 1, speed: 2.4, v: rng.int(0, VIOLATIONS.length - 1) }, dead: false, perfectStreak: 0 };
  },

  step(s, tap) {
    if (s.dead) return;
    s.tick++;
    const c = s.cur;
    c.x += c.dir * c.speed;
    if (c.x <= 0) { c.x = 0; c.dir = 1; }
    if (c.x + c.w >= SL_W) { c.x = SL_W - c.w; c.dir = -1; }

    if (!tap) return;

    const top = s.floors[s.floors.length - 1]!;
    const left = Math.max(c.x, top.x);
    const right = Math.min(c.x + c.w, top.x + top.w);
    const overlap = right - left;
    if (overlap < MIN_W) { s.dead = true; return; }

    const perfect = Math.abs(c.x - top.x) <= PERFECT;
    const landed: Floor = perfect ? { x: top.x, w: top.w, v: c.v, perfect: true } : { x: left, w: overlap, v: c.v, perfect: false };
    s.floors.push(landed);
    s.perfectStreak = perfect ? s.perfectStreak + 1 : 0;

    // next floor: same width as landed, faster, from a random side
    const n = s.floors.length;
    const speed = Math.min(7, 2.4 + n * 0.16);
    const dir: 1 | -1 = s.rng.next() < 0.5 ? 1 : -1;
    s.cur = { x: dir === 1 ? 0 : SL_W - landed.w, w: landed.w, dir, speed, v: s.rng.int(0, VIOLATIONS.length - 1) };
  },

  isDead: (s) => s.dead,
  score: (s) => s.floors.length - 1,
};
