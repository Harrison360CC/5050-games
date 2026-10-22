import type { Replay, Sim } from "../sim/types";

/**
 * Generic fixed-timestep driver + tap recorder. One per run. Works for any Sim.
 * A tap is queued and applied on the NEXT tick so client and server agree
 * exactly which tick it landed on.
 */
export class Runner<S> {
  state: S;
  readonly seed: number;
  private taps: number[] = [];
  private pendingTap = false;
  private acc = 0;
  private readonly dt: number;
  private last = 0;
  started = false;
  tick = 0;

  constructor(private sim: Sim<S>, seed: number) {
    this.seed = seed;
    this.state = sim.init(seed);
    this.dt = 1000 / sim.tickRate;
  }

  tap() {
    this.started = true;
    this.pendingTap = true;
  }

  frame(now: number): number {
    if (!this.started || this.dead) { this.last = now; return 0; }
    if (this.last === 0) this.last = now;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    let n = 0;
    while (this.acc >= this.dt && !this.dead) {
      const tap = this.pendingTap;
      this.pendingTap = false;
      this.sim.step(this.state, tap);
      this.tick++;
      if (tap) this.taps.push(this.tick);
      this.acc -= this.dt;
      n++;
    }
    return n;
  }

  get dead() { return this.sim.isDead(this.state); }
  get score() { return this.sim.score(this.state); }

  replay(): Replay {
    return { game: this.sim.id, version: this.sim.version, seed: this.seed, taps: [...this.taps], endTick: this.tick };
  }
}
