# Game balance, measured

`npx tsx scripts/playtest.ts [seeds]` plays every game with bots at four skill
levels and prints the score distribution and run length. Re-run it after ANY
change to a sim, and bump that sim's `version` in the same commit: a score
banked under one version is not comparable to one banked under another, and
`verify()` refuses replays whose version it does not recognise.

Bot models, by game type:
- pigeon is continuous control, so skill is a reaction delay in ticks.
- rent is reactive, so skill is how often the player re-reads the screen.
- slumlord is a timing press, so skill is press jitter in ticks.

The `perfect` row is a zero-error machine, not a person. It is there as an
upper bound and to show what a script would score, not as a target.

## v3 (23 Oct 2026), 150 seeds

| game | casual | average | good | expert | perfect | expert run |
|---|---|---|---|---|---|---|
| pigeon | 2.8 | 17.4 | 33 | 43.7 | 51.7 | 59s |
| rent | 11.2 | 36.6 | 84 | 332 | 383 | 180s (cap) |
| slumlord | 17.1 | 43.2 | 130 | 301 | 2864 | 74s |

What a healthy curve looks like: strictly increasing across skill levels, a
wide spread between good and expert (so a week's leaderboard separates), and
runs of roughly 40-90 seconds for a competent player.

## What the numbers caught

- v1 pigeon scored 0.1 / 0.4 / 14.6 / 16: a wall at the start and no ceiling.
  The drunk wobble was a random walk on velocity, so runs ended on luck.
- v1 rent scored 22.7 / 19.4 / 16.8 / 14.0, inverted: better reflexes scored
  worse, because the jump hung so long that sloppy early jumps beat precise
  ones.
- v1 slumlord scored 33.6 / 40.5 / 39.9 / 40.6, flat: skill did nothing,
  because the tower narrowed at the same rate however well you played.

None of these were visible by playing for a few minutes. All three were
obvious within one run of the harness.
