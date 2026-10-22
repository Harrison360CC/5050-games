import { Rng } from "./rng";
import type { Sim } from "./types";

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
const GRAVITY = 0.62;
const JUMP_VY = -12.2;
const BASE_SPEED = 4.2;

const KINDS: { kind: ObstacleKind; w: number; h: number; minScore: number }[] = [
  { kind: "notice", w: 18, h: 26, minScore: 0 },
  { kind: "cone", w: 20, h: 30, minScore: 0 },
  { kind: "couch", w: 54, h: 30, minScore: 6 },
  { kind: "ex", w: 20, h: 48, minScore: 12 },
];

export function rentSpeed(dist: number) {
  // no soft cap: like the dino game, it keeps getting faster until reaction time fails
  return Math.min(18, BASE_SPEED + dist / 900);
}

export const rentSim: Sim<RentState> = {
  id: "rent",
  version: 1,
  tickRate: 60,

  init(seed) {
    return { rng: new Rng(seed), tick: 0, dist: 0, y: RENT_GROUND, vy: 0, onGround: true, obstacles: [], nextSpawn: 420, dead: false };
  },

  step(s, tap) {
    if (s.dead) return;
    s.tick++;
    const speed = rentSpeed(s.dist);
    s.dist += speed;

    if (tap && s.onGround) { s.vy = JUMP_VY; s.onGround = false; }
    if (!s.onGround) {
      s.vy += GRAVITY;
      s.y += s.vy;
      if (s.y >= RENT_GROUND) { s.y = RENT_GROUND; s.vy = 0; s.onGround = true; }
    }

    if (s.dist >= s.nextSpawn) {
      const score = Math.floor(s.dist / 60);
      const pool = KINDS.filter((k) => score >= k.minScore);
      const k = pool[s.rng.int(0, pool.length - 1)]!;
      s.obstacles.push({ kind: k.kind, x: RENT_W + 20, w: k.w, h: k.h, passed: false });
      // gap shrinks with speed but stays jumpable
      const gap = s.rng.int(200, 380) + speed * 14;
      s.nextSpawn = s.dist + gap;
    }

    for (const o of s.obstacles) {
      o.x -= speed;
      if (!o.passed && o.x + o.w < PLAYER_X) o.passed = true;
    }
    while (s.obstacles.length && s.obstacles[0]!.x + s.obstacles[0]!.w < -20) s.obstacles.shift();

    // AABB collision, player box is slightly forgiving
    const px = PLAYER_X + 3, pw = PLAYER_W - 6, pTop = s.y - PLAYER_H + 4, pBot = s.y;
    for (const o of s.obstacles) {
      const oTop = RENT_GROUND - o.h;
      if (px < o.x + o.w && px + pw > o.x && pBot > oTop && pTop < RENT_GROUND) { s.dead = true; return; }
    }
  },

  isDead: (s) => s.dead,
  score: (s) => Math.floor(s.dist / 60),
};

export const RENT = { PLAYER_X, PLAYER_W, PLAYER_H };
