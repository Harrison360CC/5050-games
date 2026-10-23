import type { Replay, Sim } from "../sim/types";
import { MIN_TAP_GAP } from "../sim/limits";

/**
 * Generic fixed-timestep driver + tap recorder. One per run. Works for any Sim.
 * A tap is queued and applied on the NEXT tick so client and server agree
 * exactly which tick it landed on.
 */
export class Runner<S> {
  state: S;
  readonly seed: number;
  private taps: number[] = [];
  private pendingTaps = 0;
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
    // Swallow taps that land too close together instead of recording them. The
    // player loses nothing: the run stays valid and only the extra tap is lost.
    if (this.taps.length && this.tick + 1 - this.taps[this.taps.length - 1]! < MIN_TAP_GAP) return;
    // Queue, never a single flag: two taps inside one rendered frame used to
    // collapse into one, which on a 30fps phone is any two taps within 33ms.
    this.pendingTaps = Math.min(4, this.pendingTaps + 1);
  }

  frame(now: number): number {
    if (!this.started || this.dead) { this.last = now; return 0; }
    if (this.last === 0) this.last = now;
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    let n = 0;
    while (this.acc >= this.dt && !this.dead) {
      const tap = this.pendingTaps > 0;
      if (tap) this.pendingTaps--;
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
