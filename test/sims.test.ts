import { test } from "node:test";
import assert from "node:assert/strict";
import { rentSim, RENT_GROUND, type RentState } from "../src/sim/rent";
import { slumlordSim, type SlumlordState } from "../src/sim/slumlord";
import { verify } from "../src/sim/verify";
import type { Replay } from "../src/sim/types";

function rentBot(seed: number): { replay: Replay; score: number } {
  const s: RentState = rentSim.init(seed);
  const taps: number[] = [];
  // the bot stops jumping after 12 obstacles so the run ends; it's a determinism test, not a skill test
  while (!s.dead && s.tick < 60 * 60 * 3) {
    const next = s.obstacles.find((o) => o.x + o.w > 70);
    const tap = rentSim.score(s) < 12 * 6 && !!next && s.onGround && next.x - 70 < 70 && next.x - 70 > 20;
    rentSim.step(s, tap);
    if (tap) taps.push(s.tick);
  }
  return { replay: { game: "rent", version: 1, seed, taps, endTick: s.tick }, score: rentSim.score(s) };
}

function slumBot(seed: number): { replay: Replay; score: number } {
  const s: SlumlordState = slumlordSim.init(seed);
  const taps: number[] = [];
  let lastTap = -100;
  // drop each floor a third of the way off, so the tower narrows and the run ends
  while (!s.dead && s.tick < 60 * 60 * 3) {
    const top = s.floors[s.floors.length - 1]!;
    const off = s.cur.x - top.x;
    const want = top.w / 3;
    const tap = off >= want && off <= want + s.cur.speed && s.cur.dir === 1 && s.tick - lastTap >= 6;
    slumlordSim.step(s, tap);
    if (tap) { taps.push(s.tick); lastTap = s.tick; }
  }
  return { replay: { game: "slumlord", version: 1, seed, taps, endTick: s.tick }, score: slumlordSim.score(s) };
}

test("rent: replay reproduces score for 100 seeds and bot scores > 0", () => {
  let total = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const { replay, score } = rentBot(seed);
    const r = verify(replay);
    if (!r.ok) assert.fail(`seed ${seed}: ${r.reason}`);
    assert.equal(r.score, score, `seed ${seed}`);
    total += score;
  }
  assert.ok(total > 100, `rent bot total ${total}`);
});

test("slumlord: replay reproduces score for 100 seeds", () => {
  let total = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const { replay, score } = slumBot(seed);
    const r = verify(replay);
    if (!r.ok) assert.fail(`seed ${seed}: ${r.reason}`);
    assert.equal(r.score, score, `seed ${seed}`);
    total += score;
  }
  assert.ok(total > 100, `slumlord bot total ${total}`);
});

test("rent: player starts on the ground and can't double jump", () => {
  const s = rentSim.init(1);
  assert.equal(s.y, RENT_GROUND);
  rentSim.step(s, true);
  const vy1 = s.vy;
  rentSim.step(s, true);
  assert.ok(s.vy > vy1, "second tap mid-air should not reset vy");
});
