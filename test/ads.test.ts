import { test } from "node:test";
import assert from "node:assert/strict";
import { AdPolicy, AD_RULES, memoryCountStore } from "../src/ads/policy";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test("first interstitial after 2nd death, then every 3rd, respecting the time gap", () => {
  const c = clock();
  const p = new AdPolicy(memoryCountStore(), c.now);
  const log: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const d = p.onDeath();
    log.push(d);
    if (d === "interstitial") p.interstitialShown();
    c.advance(100_000); // each run is longer than MIN_GAP_MS so only death count gates
  }
  // deaths 2, 5, 8, 11 -> ads (14 would be the 5th, over the session cap)
  assert.deepEqual(
    log.map((d, i) => (d === "interstitial" ? i + 1 : null)).filter(Boolean),
    [2, 5, 8, 11],
  );
});

test("never two ads within MIN_GAP_MS even if death count says so", () => {
  const c = clock();
  const p = new AdPolicy(memoryCountStore(), c.now);
  p.onDeath(); // 1
  assert.equal(p.onDeath(), "interstitial"); p.interstitialShown(); // 2
  c.advance(5_000);
  p.onDeath(); p.onDeath();
  assert.equal(p.onDeath(), "none"); // death 5, but only 5s since last ad
});

test("daily cap holds across sessions and resets at UTC midnight", () => {
  const store = memoryCountStore();
  const c = clock(Date.UTC(2026, 9, 22, 10, 0, 0));
  let p = new AdPolicy(store, c.now);
  let shown = 0;
  for (let s = 0; s < 5; s++) {
    p = new AdPolicy(store, c.now); // new session
    for (let i = 0; i < 20; i++) {
      if (p.onDeath() === "interstitial") { p.interstitialShown(); shown++; }
      c.advance(100_000);
    }
  }
  assert.equal(shown, AD_RULES.MAX_INTERSTITIALS_PER_DAY);
  // after midnight UTC the cap resets
  c.advance(24 * 3600_000);
  p = new AdPolicy(store, c.now);
  p.onDeath();
  assert.equal(p.onDeath(), "interstitial");
});

test("rewarded: never a play-affecting offer in ranked, one per run, not consecutive runs, 3 per day", () => {
  const p = new AdPolicy(memoryCountStore(), clock().now);
  p.onRunStart();
  assert.equal(p.canOfferRewarded({ ranked: true, rewardAffectsPlay: true }), false);
  assert.equal(p.canOfferRewarded({ ranked: true, rewardAffectsPlay: false }), true); // cosmetic is fine
  assert.equal(p.canOfferRewarded({ ranked: false, rewardAffectsPlay: true }), true); // practice continue ok
  p.rewardedOffered();
  assert.equal(p.canOfferRewarded({ ranked: false, rewardAffectsPlay: true }), false); // same run
  p.onRunStart();
  assert.equal(p.canOfferRewarded({ ranked: false, rewardAffectsPlay: true }), false); // consecutive run
  p.onRunStart();
  assert.equal(p.canOfferRewarded({ ranked: false, rewardAffectsPlay: true }), true);
  for (let i = 0; i < AD_RULES.MAX_REWARDED_PER_DAY; i++) p.rewardedCompleted();
  p.onRunStart(); p.onRunStart();
  assert.equal(p.canOfferRewarded({ ranked: false, rewardAffectsPlay: true }), false); // daily cap
});
