/**
 * A recorded run. This is the ONLY thing the client sends the server.
 * The server replays it and computes the score itself.
 */
export interface Replay {
  game: GameId;
  /** Sim version. Server rejects replays from sim versions it doesn't have. */
  version: number;
  /** 32-bit seed issued by the server when the run started. */
  seed: number;
  /** Tick indices (0-based) on which the player tapped. Must be strictly increasing. */
  taps: number[];
  /** Tick on which the run ended (death). */
  endTick: number;
}

export type GameId = "pigeon" | "rent" | "slumlord";

/** Every sim exposes the same shape so the verifier is generic. */
export interface Sim<State> {
  readonly id: GameId;
  readonly version: number;
  /** Fixed tick rate in Hz. The renderer interpolates; the sim never varies. */
  readonly tickRate: number;
  init(seed: number): State;
  /** Advance one tick. `tap` is true if the player tapped on this tick. */
  step(state: State, tap: boolean): void;
  isDead(state: State): boolean;
  score(state: State): number;
}
