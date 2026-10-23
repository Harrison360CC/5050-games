import { Rng } from "./rng";
import type { Sim } from "./types";
import { RUN_TICKS } from "./limits";

/**
 * Rent's Due. A guy in boxers runs right; obstacles scroll left; tap to jump.
 * World 360x640. Score = distance in "days of rent dodged" (1 day per 60 world px).
 * Speed ramps with distance. The landlord's distance behind you is cosmetic
 * but derived from state so the renderer can draw him closing in.
 */

export const RENT_W = 360;
export const RENT_H = 640;
export const RENT_GROUND = 480;

export type ObstacleKind = "notice" | "couch" | "ex" | "cone";
export interface Obstacle { kind: ObstacleKind; x: number; w: number; h: number; passed: boolean }

export interface RentState {
  rng: Rng;
  tick: number;
  dist: number;        // world px travelled
  dodged: number;      // obstacles cleared: this is the score
  y: number;           // player's feet y (RENT_GROUND when on ground)
  vy: number;
  onGround: boolean;
  obstacles: Obstacle[];
  nextSpawn: number;   // dist at which to spawn next obstacle
  dead: boolean;
}

const PLAYER_X = 70;
const PLAYER_W = 22;
const PLAYER_H = 44;
const GRAVITY = 0.72;
const JUMP_VY = -13.5;
/** Exposed so the playtest bot derives its jump timing from the real physics. */
export const RENT_TUNE = { gravity: GRAVITY, jumpVy: JUMP_VY };
/** Ticks airborne for a full jump. Spacing is derived from this so a landing always fits. */
const HANG = Math.ceil((2 * Math.abs(JUMP_VY)) / GRAVITY);
const BASE_SPEED = 3.8;

/** Size ramps with progress: the first minute is winnable by anyone. */
const KINDS: { kind: ObstacleKind; w: number; h: number; minScore: number }[] = [
  { kind: "notice", w: 16, h: 18, minScore: 0 },
  { kind: "cone", w: 20, h: 26, minScore: 4 },
  { kind: "couch", w: 48, h: 30, minScore: 12 },
  { kind: "ex", w: 20, h: 42, minScore: 22 },
];

/**
 * Ramps on TICKS, not distance, and caps. Ramping on distance compounds
 * (faster -> more distance -> faster), which ran away to hundreds of px per
 * tick: obstacles then crossed the player between two ticks and were never
 * tested, handing out free points exactly where the top scores live.
 */
export function rentSpeed(tick: number) {
  return Math.min(13, BASE_SPEED + tick / 1100);
}

/**
 * Could a player clear something `span` wide and `h` tall at this speed?
 * Pure geometry from the jump arc. The spawner refuses to create anything
 * that fails this, so no run is ever ended by an unjumpable spawn.
 */
export function clearable(span: number, h: number, speed: number, slack = 5): boolean {
  let t = 0, y = 0, vy = JUMP_VY, up = -1, down = -1;
  while (t < 300) {
    vy += GRAVITY; y += vy; t++;
    const ht = -y;
    if (ht >= h + 5 && up < 0) up = t;
    if (up > 0 && ht < h + 5) { down = t; break; }
    if (ht <= 0 && t > 2) { down = t; break; }
  }
  if (up < 0 || down < 0) return false;
  // Slack either side so nothing is ever frame-perfect. It tightens as you get
  // further, which is where the difficulty now comes from: span, not raw speed.
  return (down - up) - (span + 16) / speed >= slack;
}

export const rentSim: Sim<RentState> = {
  id: "rent",
  version: 3,
  tickRate: 60,

  init(seed) {
    return { rng: new Rng(seed), tick: 0, dist: 0, dodged: 0, y: RENT_GROUND, vy: 0, onGround: true, obstacles: [], nextSpawn: 420, dead: false };
  },

  step(s, tap) {
    if (s.dead) return;
    s.tick++;
    if (s.tick >= RUN_TICKS) { s.dead = true; return; }
    const speed = rentSpeed(s.tick);
    s.dist += speed;

    if (tap && s.onGround) { s.vy = JUMP_VY; s.onGround = false; }
    if (!s.onGround) {
      s.vy += GRAVITY;
      s.y += s.vy;
      if (s.y >= RENT_GROUND) { s.y = RENT_GROUND; s.vy = 0; s.onGround = true; }
    }

    if (s.dist >= s.nextSpawn) {
      const pool = KINDS.filter((k) => s.dodged >= k.minScore);
      // Clusters are the real difficulty: two or three things you must clear in ONE jump.
      // The chance and the size grow with how far you've got, never with luck alone.
      const clusterOdds = Math.min(0.85, Math.max(0, (s.dodged - 10) * 0.016));
      let n = 1;
      if (s.rng.next() < clusterOdds) {
        const big = s.rng.next();
        n = s.dodged > 90 && big < 0.25 ? 5 : s.dodged > 50 && big < 0.45 ? 4 : s.dodged > 25 && big < 0.6 ? 3 : 2;
      }
      const group: Obstacle[] = [];
      let x = RENT_W + 20;
      for (let i = 0; i < n; i++) {
        const k = pool[s.rng.int(0, pool.length - 1)]!;
        group.push({ kind: k.kind, x, w: k.w, h: k.h, passed: false });
        x += k.w + s.rng.int(12, Math.max(14, 40 - s.dodged * 0.15));
      }
      // fairness guard: drop pieces off the back until the group is jumpable
      while (group.length > 1) {
        const last = group[group.length - 1]!;
        const span = last.x + last.w - group[0]!.x;
        const h = Math.max(...group.map((g) => g.h));
        if (clearable(span, h, speed, Math.max(1, 6 - s.dodged * 0.045))) break;
        group.pop();
      }
      for (const g of group) s.obstacles.push(g);
      x = group[group.length - 1]!.x + group[group.length - 1]!.w;
      const span = x - (RENT_W + 20);
      const gap = span + speed * (HANG + 6) + s.rng.int(0, 160);
      s.nextSpawn = s.dist + gap;
    }

    for (const o of s.obstacles) {
      o.x -= speed;
      if (!o.passed && o.x + o.w < PLAYER_X) { o.passed = true; s.dodged++; }
    }
    while (s.obstacles.length && s.obstacles[0]!.x + s.obstacles[0]!.w < -20) s.obstacles.shift();

    // AABB collision, player box is slightly forgiving
    // Swept test: an obstacle moved `speed` px this tick, so check the whole
    // span it covered, not just where it landed. Nothing can tunnel through.
    const px = PLAYER_X + 3, pw = PLAYER_W - 6, pTop = s.y - PLAYER_H + 4, pBot = s.y;
    for (const o of s.obstacles) {
      const oTop = RENT_GROUND - o.h;
      if (px < o.x + o.w + speed && px + pw > o.x && pBot > oTop && pTop < RENT_GROUND) { s.dead = true; return; }
    }
  },

  isDead: (s) => s.dead,
  score: (s) => s.dodged,
};

export const RENT = { PLAYER_X, PLAYER_W, PLAYER_H };
