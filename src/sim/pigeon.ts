import { Rng } from "./rng";
import type { Sim } from "./types";

/**
 * Drunk Pigeon sim. Pure, deterministic, no DOM, no Math.random, no Date.
 * All units are in "world pixels" on a fixed 360x640 world. The renderer
 * scales to the screen; the sim never knows the screen exists.
 *
 * Difficulty ramp: as score climbs the gaps narrow and the "drunk" wobble
 * (a per-tick sideways drift on the pigeon's vertical velocity) grows.
 */

export const WORLD_W = 360;
export const WORLD_H = 640;

export interface Gap {
  x: number; // left edge of the obstacle column
  gapY: number; // top of the gap
  gapH: number; // height of the gap
  passed: boolean;
}

export interface PigeonState {
  rng: Rng;
  tick: number;
  y: number;
  vy: number;
  gaps: Gap[];
  score: number;
  dead: boolean;
  /** Rolling drunk offset, purely cosmetic-feeling but it IS part of the sim. */
  wobble: number;
}

const PIGEON_X = 90;
const PIGEON_R = 14; // collision radius
const GRAVITY = 0.42;
const FLAP_VY = -7.2;
const MAX_VY = 10;
const COL_W = 52;
const SPEED = 2.6; // world px per tick
const SPAWN_EVERY = 95; // ticks
const GROUND_Y = WORLD_H - 40;

function spawnGap(rng: Rng, score: number): Gap {
  // gap shrinks from 170 to 120 over the first 30 points
  const gapH = Math.max(120, 170 - score * (50 / 30));
  const minY = 60;
  const maxY = GROUND_Y - gapH - 60;
  return {
    x: WORLD_W + 10,
    gapY: rng.int(minY, maxY),
    gapH,
    passed: false,
  };
}

export const pigeonSim: Sim<PigeonState> = {
  id: "pigeon",
  version: 1,
  tickRate: 60,

  init(seed) {
    const rng = new Rng(seed);
    return {
      rng,
      tick: 0,
      y: WORLD_H / 2,
      vy: 0,
      gaps: [],
      score: 0,
      dead: false,
      wobble: 0,
    };
  },

  step(s, tap) {
    if (s.dead) return;
    s.tick++;

    // drunkness: grows with score, caps so it's hard but not random-death
    const drunk = Math.min(1.6, s.score * 0.05);
    // smooth-ish wobble driven by rng so it's reproducible
    s.wobble = s.wobble * 0.9 + (s.rng.next() - 0.5) * drunk;

    if (tap) s.vy = FLAP_VY;
    s.vy = Math.min(MAX_VY, s.vy + GRAVITY + s.wobble * 0.15);
    s.y += s.vy;

    if (s.tick % SPAWN_EVERY === 1) s.gaps.push(spawnGap(s.rng, s.score));

    for (const g of s.gaps) {
      g.x -= SPEED;
      if (!g.passed && g.x + COL_W < PIGEON_X) {
        g.passed = true;
        s.score++;
      }
    }
    // drop off-screen columns
    while (s.gaps.length && s.gaps[0]!.x + COL_W < -10) s.gaps.shift();

    // collisions
    if (s.y + PIGEON_R >= GROUND_Y || s.y - PIGEON_R <= 0) {
      s.dead = true;
      return;
    }
    for (const g of s.gaps) {
      const inX = PIGEON_X + PIGEON_R > g.x && PIGEON_X - PIGEON_R < g.x + COL_W;
      if (!inX) continue;
      const aboveGap = s.y - PIGEON_R < g.gapY;
      const belowGap = s.y + PIGEON_R > g.gapY + g.gapH;
      if (aboveGap || belowGap) {
        s.dead = true;
        return;
      }
    }
  },

  isDead: (s) => s.dead,
  score: (s) => s.score,
};

export const PIGEON = { PIGEON_X, PIGEON_R, COL_W, GROUND_Y };
