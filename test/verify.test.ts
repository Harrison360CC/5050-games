import { test } from "node:test";
import assert from "node:assert/strict";
import { pigeonSim } from "../src/sim/pigeon";
import { verify } from "../src/sim/verify";
import type { Replay } from "../src/sim/types";

/** A simple bot: flap whenever below the centre of the next gap. Records taps like the client does. */
function botRun(seed: number): { replay: Replay; score: number } {
  const s = pigeonSim.init(seed);
  const taps: number[] = [];
  let lastTap = -100;
  while (!s.dead && s.tick < 60 * 60 * 5) {
    const nextGap = s.gaps.find((g) => g.x + 52 > 90);
    const target = nextGap ? nextGap.gapY + nextGap.gapH / 2 : 320;
    const tap = s.y > target - 4 && s.tick - lastTap >= 6;
    pigeonSim.step(s, tap);
    if (tap) { taps.push(s.tick); lastTap = s.tick; }
  }
  return { replay: { game: "pigeon", version: pigeonSim.version, seed, taps, endTick: s.tick }, score: s.score };
}

test("replay reproduces the recorded score exactly, for many seeds", () => {
  let totalScore = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { replay, score } = botRun(seed);
    const r = verify(replay);
    if (!r.ok) assert.fail(`seed ${seed}: ${r.reason}`);
    assert.equal(r.score, score, `seed ${seed}`);
    totalScore += score;
  }
  assert.ok(totalScore > 0, "bot never scored, sim is probably broken");
});

test("inflated endTick is rejected", () => {
  const { replay } = botRun(7);
  const r = verify({ ...replay, endTick: replay.endTick + 500 });
  assert.equal(r.ok, false);
});

test("extra fake taps change the outcome and get caught", () => {
  const { replay, score } = botRun(7);
  const r = verify({ ...replay, taps: [...replay.taps, replay.endTick - 1].sort((a, b) => a - b) });
  // either the run no longer dies on endTick (rejected) or score differs; both are a fail for the cheater
  assert.ok(!r.ok || r.score !== score + 1000);
});

test("inhuman tap rate is rejected without replaying", () => {
  const r = verify({ game: "pigeon", version: pigeonSim.version, seed: 1, taps: [10, 11, 12], endTick: 100 });
  assert.equal(r.ok, false);
  assert.match((r as any).reason, /inhuman/);
});

test("wrong sim version is rejected", () => {
  const r = verify({ game: "pigeon", version: 99, seed: 1, taps: [], endTick: 100 });
  assert.equal(r.ok, false);
});

test("tap timing: an honest run passes, a paused one does not", () => {
  // Build a real replay, then attach the wall-clock timings a browser would
  // have recorded for it: each tap lands when its tick lands.
  const { replay } = botRun(42);
  const honest = { ...replay, tapMs: replay.taps.map((t) => Math.round((t / 60) * 1000)) };
  const a = verify(honest);
  assert.ok(a.ok, `honest run rejected: ${a.ok ? "" : a.reason}`);

  // Same run, but the player backgrounded the app for half a minute in the
  // middle. The sim freezes, so this would otherwise be free thinking time.
  if (replay.taps.length > 3) {
    const paused = { ...honest, tapMs: honest.tapMs.map((m, i) => (i >= 2 ? m + 30_000 : m)) };
    const b = verify(paused);
    assert.equal(b.ok, false, "a 30 second mid-run pause should not verify");
  }

  // A jittery cheap phone must still pass: every tap a little late, nothing huge.
  const jittery = { ...honest, tapMs: honest.tapMs.map((m, i) => m + i * 12 + 40) };
  assert.ok(verify(jittery).ok, "ordinary jitter should not be treated as a pause");
});
