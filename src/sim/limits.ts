/**
 * Every run is capped at three minutes. A weekly pot should go to the best
 * player, not the one with the most free time or the most patient script, and
 * nobody should have to grind a twenty-minute run to compete. The cap is part
 * of the sim, so the server enforces it when it replays.
 */
export const RUN_TICKS = 60 * 180;

/**
 * Minimum ticks between two recorded taps. Enforced at INPUT time by the
 * runner, so a fast double-tap is simply ignored rather than invalidating the
 * whole run. The verifier uses the same number as a backstop, but a human
 * should never be able to produce a replay that trips it.
 */
export const MIN_TAP_GAP = 3;
