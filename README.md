# 5050 Games

Three dumb one-tap games. Top score each week takes half the ad money.

## Layout

```
src/sim/        pure deterministic game sims (no DOM, no Math.random, no Date)
  rng.ts        seeded PRNG, identical in browser and Node
  pigeon.ts     Drunk Pigeon sim
  verify.ts     replays a Replay and computes the score from scratch
src/games/      canvas renderers + input recorders (one folder per game)
src/demo.*      playable demo that runs the verifier in-page after each run
worker/         Cloudflare Worker: issues seeds, verifies replays, writes scores
supabase/       schema + RLS (only the Worker's service key can write runs)
test/           replay round-trip tests
```

## The anti-cheat model in one paragraph

The client never sends a score. It sends a `Replay`: the seed the server issued,
the list of ticks the player tapped on, and the tick the run ended. The Worker
reruns the exact same sim with those inputs and computes the score itself. If
the replay doesn't die on the claimed tick, it's rejected and kept as evidence.
Scores can only be written with the Supabase service key, which lives in the
Worker, so there is no path from a browser to the leaderboard that skips the
replay. Rate limits and a human look at the top 10 before payout cover the rest.

Rules that keep the sim deterministic (break these and the server will reject
honest runs):
- seeded RNG only (`Rng`), never `Math.random`
- fixed tick rate; the renderer interpolates, the sim never reads the clock
- integer tick indices for taps; a tap is applied on the next tick
- bump `sim.version` on any gameplay change; old replays stop verifying

## Run it

```
npm install
npm test          # 200-seed replay round-trip + rejection cases
npm run demo      # builds dist/pigeon.html (single file, open it anywhere)
npm run dev       # vite dev server for src/
```

Worker: set secrets with `wrangler secret put SUPABASE_URL` and
`SUPABASE_SERVICE_KEY`, run `supabase/schema.sql` in the SQL editor, then
`npm run worker:deploy`.

## Next

- `rent` (Rent's Due) and `slumlord` sims, same `Sim` interface
- site shell with sign-in (Supabase Auth), leaderboard, rules page
- AdSense slots between runs (never incentivized)
- weekly close script: pick winner, write `weeks` row, send claim email via Resend
