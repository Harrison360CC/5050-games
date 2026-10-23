import { Rng } from "./rng";
import type { Sim } from "./types";

/**
 * Drunk Pigeon sim. Pure, deterministic, no DOM, no Math.random, no Date.
 * All units are in "world pixels" on a fixed 360x640 world. The renderer
 * scales to the screen; the sim never knows the screen exists.
 *
 * The drunkness is a VISIBLE, LEARNABLE sway: a fixed two-wave oscillation
 * whose phase and frequency come from the seed, so every run is different but
 * nothing is unpredictable. The player can see the sway and fly against it.
 * (v1 used a random walk on velocity, which killed runs by luck. A pot is on
 * the line here, so every death has to be the player's fault.)
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
  y: number; // the pigeon's "sober" y, driven purely by flaps and gravity
  vy: number;
  gaps: Gap[];
  score: number;
  dead: boolean;
  scroll: number; // world px scrolled so far
  lastSpawn: number; // scroll value of the last spawn
  /** Sway wave parameters, fixed for the run, derived from the seed. */
  w1: number; p1: number; w2: number; p2: number;
}

const PIGEON_X = 90;
const PIGEON_R = 10; // collision radius (smaller than the drawn bird: forgiving on purpose)
const GRAVITY = 0.34;
/** Small flaps early: finer control while you are learning, bigger once you can
 *  handle them. (Floatier early is WORSE: a big flap magnifies a late reaction.) */
const flapAt = (score: number) => -(4.2 + Math.min(1.2, score * 0.1));
const FLAP_VY = -5.4;
const MAX_VY = 10;
const COL_W = 52;
const GROUND_Y = WORLD_H - 40;

/** Scroll speed creeps up forever so the ceiling is reaction time, not luck. */
export function pigeonSpeed(score: number) {
  return Math.min(5.6, 2.6 + score * 0.022);
}
/** Horizontal spacing between columns, tightens slowly. */
function spacing(score: number) {
  return Math.max(190, 250 - score * 0.45);
}
/** Gap height decays towards a floor, so difficulty rises forever but never walls. */
function gapHeight(score: number) {
  return 125 + 75 * Math.exp(-score / 35);
}
/** Sway amplitude in world px, grows with score then caps. */
function swayAmp(score: number) {
  return Math.min(18, score * 0.25);
}

/** The drunk offset at this tick. Deterministic, smooth, and on screen. */
export function pigeonSway(s: PigeonState): number {
  const a = swayAmp(s.score);
  if (a === 0) return 0;
  return a * (Math.sin(s.tick * s.w1 + s.p1) * 0.7 + Math.sin(s.tick * s.w2 + s.p2) * 0.3);
}

/** Where the pigeon actually is, sway included. Collisions and drawing use this. */
export function pigeonY(s: PigeonState): number {
  return s.y + pigeonSway(s);
}

function spawnGap(rng: Rng, score: number): Gap {
  const gapH = gapHeight(score);
  const amp = swayAmp(score);
  // keep the gap reachable: never put it so high or low that the sway alone kills you
  const minY = 50 + amp;
  const maxY = GROUND_Y - gapH - 50 - amp;
  return { x: WORLD_W + 10, gapY: rng.int(minY, Math.max(minY, maxY)), gapH, passed: false };
}

export const pigeonSim: Sim<PigeonState> = {
  id: "pigeon",
  version: 2,
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
      scroll: 0,
      lastSpawn: -140, // first column arrives quickly but not instantly
      w1: 0.021 + rng.next() * 0.012,
      p1: rng.next() * Math.PI * 2,
      w2: 0.047 + rng.next() * 0.020,
      p2: rng.next() * Math.PI * 2,
    };
  },

  step(s, tap) {
    if (s.dead) return;
    s.tick++;

    if (tap) s.vy = flapAt(s.score);
    s.vy = Math.min(MAX_VY, s.vy + GRAVITY);
    s.y += s.vy;

    const speed = pigeonSpeed(s.score);
    s.scroll += speed;
    if (s.scroll - s.lastSpawn >= spacing(s.score)) {
      s.gaps.push(spawnGap(s.rng, s.score));
      s.lastSpawn = s.scroll;
    }

    for (const g of s.gaps) {
      g.x -= speed;
      if (!g.passed && g.x + COL_W < PIGEON_X) {
        g.passed = true;
        s.score++;
      }
    }
    while (s.gaps.length && s.gaps[0]!.x + COL_W < -10) s.gaps.shift();

    // The sky is a lid, not a wall: bonking the top costs you height, not the run.
    // Only the ground and the buildings actually kill.
    if (s.y - PIGEON_R < 0) { s.y = PIGEON_R; if (s.vy < 0) s.vy = 0; }
    const y = pigeonY(s);
    if (y + PIGEON_R >= GROUND_Y) {
      s.dead = true;
      return;
    }
    for (const g of s.gaps) {
      const inX = PIGEON_X + PIGEON_R > g.x && PIGEON_X - PIGEON_R < g.x + COL_W;
      if (!inX) continue;
      if (y - PIGEON_R < g.gapY || y + PIGEON_R > g.gapY + g.gapH) {
        s.dead = true;
        return;
      }
    }
  },

  isDead: (s) => s.dead,
  score: (s) => s.score,
};

export const PIGEON = { PIGEON_X, PIGEON_R, COL_W, GROUND_Y };
