/**
 * Ad policy for 5050 Games. Every game asks this module whether it may show
 * an ad; no game decides on its own. Numbers come from docs/ad-revenue-research.md.
 *
 * Rules encoded here:
 *  - Interstitials only at the restart tap after a death, never mid-run.
 *  - First interstitial no earlier than the 2nd death of a session.
 *  - Then at most one every 3rd death, and never within MIN_GAP_MS of the last ad.
 *  - Hard caps: 4 interstitials per session, 12 per player per day.
 *  - Rewarded ads are opt-in, disclosed, skippable. Reward is always in-game
 *    (an extra PRACTICE run, a cosmetic). Never a continue in ranked, never
 *    score, never cash. Copy must never say "watch to win" or mention the pot
 *    as the reward.
 *  - Rewarded caps: 1 offer per run, never on consecutive runs, 3 views per day.
 *  - Whatever the policy says, the ad network's own frequency cap wins; callers
 *    must always resume the game when the network returns frequencyCapped.
 */

export const AD_RULES = {
  FIRST_INTERSTITIAL_AFTER_DEATH: 2,
  INTERSTITIAL_EVERY_N_DEATHS: 3,
  MIN_GAP_MS: 90_000,
  MAX_INTERSTITIALS_PER_SESSION: 4,
  MAX_INTERSTITIALS_PER_DAY: 12,
  MAX_REWARDED_PER_DAY: 3,
  /** 50% of what actually lands from the network, after Google's cut. */
  POT_SHARE: 0.5,
} as const;

export type AdDecision = "none" | "interstitial";

export interface DailyCounts {
  day: string; // YYYY-MM-DD UTC
  interstitials: number;
  rewarded: number;
}

/** Storage shim so the policy is testable without a browser. */
export interface CountStore {
  load(): DailyCounts | null;
  save(c: DailyCounts): void;
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export class AdPolicy {
  private deaths = 0;
  private sessionInterstitials = 0;
  private lastAdAt = -Infinity;
  private lastRewardedOfferRun = -1;
  private runIndex = 0;
  private daily: DailyCounts;

  constructor(private store: CountStore, private now: () => number = Date.now) {
    const d = store.load();
    this.daily = d && d.day === utcDay(now()) ? d : { day: utcDay(now()), interstitials: 0, rewarded: 0 };
  }

  /** Call when a run starts. */
  onRunStart() {
    this.runIndex++;
  }

  /**
   * Call when the player taps to restart after a death. Returns whether an
   * interstitial may be shown before the next run begins.
   */
  onDeath(): AdDecision {
    this.deaths++;
    this.rollDay();
    if (this.deaths < AD_RULES.FIRST_INTERSTITIAL_AFTER_DEATH) return "none";
    const sinceFirst = this.deaths - AD_RULES.FIRST_INTERSTITIAL_AFTER_DEATH;
    if (sinceFirst % AD_RULES.INTERSTITIAL_EVERY_N_DEATHS !== 0) return "none";
    if (this.now() - this.lastAdAt < AD_RULES.MIN_GAP_MS) return "none";
    if (this.sessionInterstitials >= AD_RULES.MAX_INTERSTITIALS_PER_SESSION) return "none";
    if (this.daily.interstitials >= AD_RULES.MAX_INTERSTITIALS_PER_DAY) return "none";
    return "interstitial";
  }

  /** Call only after the network confirms it actually showed the interstitial. */
  interstitialShown() {
    this.sessionInterstitials++;
    this.daily.interstitials++;
    this.lastAdAt = this.now();
    this.store.save(this.daily);
  }

  /**
   * May the game OFFER a rewarded ad right now? `ranked` runs never get an
   * offer that affects play; callers pass ranked=true to get a hard "no" for
   * any continue-style reward.
   */
  /**
   * For a surface with no runs, which today means the Loyalty Pod.
   *
   * `canOfferRewarded` enforces two run-pacing rules ("one per run", "not on
   * consecutive runs") whose job is to avoid interrupting play. On a surface
   * where nothing is being played they are not just meaningless, they are
   * fatal: the pod called `canOfferRewarded` BEFORE `onRunStart`, so on the
   * first pod of a session `lastRewardedOfferRun === runIndex - 1` compared
   * -1 to -1 and refused. The pod was the only caller in the codebase, so the
   * rewarded path never fired for anyone, ever. Every visitor who walked into
   * an open pod was told the pods were closed for the night.
   *
   * Off-play surfaces get the daily cap and nothing else.
   */
  canOfferRewardedOffPlay(): boolean {
    this.rollDay();
    return this.daily.rewarded < AD_RULES.MAX_REWARDED_PER_DAY;
  }

  canOfferRewarded(opts: { ranked: boolean; rewardAffectsPlay: boolean }): boolean {
    this.rollDay();
    if (opts.ranked && opts.rewardAffectsPlay) return false;
    if (this.daily.rewarded >= AD_RULES.MAX_REWARDED_PER_DAY) return false;
    if (this.lastRewardedOfferRun === this.runIndex) return false; // one per run
    if (this.lastRewardedOfferRun === this.runIndex - 1) return false; // not consecutive runs
    return true;
  }

  rewardedOffered() {
    this.lastRewardedOfferRun = this.runIndex;
  }

  /** Call only after the network confirms the viewer finished the ad. */
  rewardedCompleted() {
    this.daily.rewarded++;
    this.store.save(this.daily);
  }

  get stats() {
    return { deaths: this.deaths, sessionInterstitials: this.sessionInterstitials, ...this.daily };
  }

  private rollDay() {
    const today = utcDay(this.now());
    if (this.daily.day !== today) {
      this.daily = { day: today, interstitials: 0, rewarded: 0 };
      this.store.save(this.daily);
    }
  }
}

/** localStorage-backed store for the browser. Never throws. */
export function browserCountStore(key = "5050.ads"): CountStore {
  return {
    load() {
      try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as DailyCounts) : null; } catch { return null; }
    },
    save(c) {
      try { localStorage.setItem(key, JSON.stringify(c)); } catch {}
    },
  };
}

export function memoryCountStore(): CountStore {
  let c: DailyCounts | null = null;
  return { load: () => c, save: (v) => { c = v; } };
}
