/**
 * Bot playtests. Human-ish bots with a reaction delay (ticks) and timing noise
 * play N seeds of each game. Prints score distribution per skill level plus
 * where runs die. Run: npx tsx scripts/playtest.ts [seeds]
 *
 * Not a cheat tool: bots see the same state a player sees, with worse reflexes.
 */
import { pigeonSim, PIGEON, pigeonSway, pigeonY, pigeonSpeed, type PigeonState } from "../src/sim/pigeon";
import { rentSim, rentSpeed, RENT_TUNE, type RentState } from "../src/sim/rent";
import { slumlordSim, type SlumlordState } from "../src/sim/slumlord";
import { Rng } from "../src/sim/rng";

const N = Number(process.argv[2] ?? 200);
const MAX_TICKS = 60 * 60 * 4;

type Skill = { name: string; react: number; noise: number; press: number };
/** react/noise drive reactive games; `press` is timing jitter in ticks for rhythm games. */
const SKILLS: Skill[] = [
  { name: "perfect", react: 0, noise: 0, press: 0 },
  { name: "casual", react: 16, noise: 1.0, press: 6 },
  { name: "average", react: 11, noise: 0.6, press: 3.5 },
  { name: "good", react: 7, noise: 0.35, press: 2.0 },
  { name: "expert", react: 4, noise: 0.15, press: 1.1 },
];

function stats(xs: number[]) {
  const a = [...xs].sort((p, q) => p - q);
  const q = (f: number) => a[Math.min(a.length - 1, Math.floor(f * a.length))]!;
  const mean = a.reduce((p, c) => p + c, 0) / a.length;
  return { mean: +mean.toFixed(1), p10: q(0.1), p50: q(0.5), p90: q(0.9), max: a[a.length - 1]! };
}
const gauss = (r: Rng) => { const u = Math.max(1e-9, r.next()), v = r.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---------- pigeon ----------
function playPigeon(seed: number, sk: Skill): { score: number; cause: string; ticks: number } {
  const s: PigeonState = pigeonSim.init(seed);
  const br = new Rng(seed * 7 + 1);
  let cooldown = 0;
  const bias = gauss(br) * 10 * sk.noise;
  const queue: boolean[] = [];
  while (!s.dead && s.tick < MAX_TICKS) {
    const next = s.gaps.find((g) => g.x + PIGEON.COL_W > PIGEON.PIGEON_X - PIGEON.PIGEON_R);
    const targetY = next ? next.gapY + next.gapH / 2 + bias : 320;
    // the sway is on screen, so a player anticipates it; better players anticipate better
    const swayNow = pigeonSway(s);
    const swayAhead = swayNow * (1 - sk.noise * 0.5);
    const predY = s.y + s.vy * sk.react + 0.5 * 0.42 * sk.react * sk.react + swayAhead;
    const want = predY > targetY + 6 + gauss(br) * 8 * sk.noise;
    queue.push(want);
    let tap = false;
    if (queue.length > sk.react) { tap = queue.shift()! && cooldown <= 0; }
    if (tap) cooldown = 6 + Math.round(Math.abs(gauss(br)) * 4 * sk.noise); else cooldown--;
    pigeonSim.step(s, tap);
  }
  const y = pigeonY(s);
  const cause = y - PIGEON.PIGEON_R <= 0 ? "ceiling" : y + PIGEON.PIGEON_R >= PIGEON.GROUND_Y ? "ground" : "column";
  return { score: s.score, cause, ticks: s.tick };
}

// ---------- rent ----------
function jumpWindow(h: number, G: number, V: number): [number, number] {
  // ticks during which the player's feet are above h (+5 margin), from the jump tick
  let t = 0, y = 0, vy = V, up = -1, down = -1;
  while (t < 300) { vy += G; y += vy; t++; const ht = -y; if (ht >= h + 5 && up < 0) up = t; if (up > 0 && ht < h + 5) { down = t; break; } if (ht <= 0 && t > 2) { down = t; break; } }
  return [up < 0 ? 999 : up, down < 0 ? 999 : down];
}
function playRent(seed: number, sk: Skill): { score: number; cause: string; ticks: number } {
  const s: RentState = rentSim.init(seed);
  const br = new Rng(seed * 7 + 2);
  const G = RENT_TUNE.gravity, V = RENT_TUNE.jumpVy;
  let lastKind = "";
  let nextSample = 0, fire = false;
  while (!s.dead && s.tick < MAX_TICKS) {
    if (s.tick >= nextSample) {
      nextSample = s.tick + Math.max(1, sk.react);
      const ahead = s.obstacles.filter((o) => o.x + o.w > 70).sort((a, b) => a.x - b.x);
      const next = ahead[0];
      fire = false;
      if (next && s.onGround) {
        const speed = rentSpeed(s.dist);
        // a player sees a cluster as one thing to clear: group anything close behind
        let left = next.x, right = next.x + next.w, h = next.h;
        for (let i = 1; i < ahead.length; i++) {
          const o = ahead[i]!;
          if (o.x - right > speed * 14) break;  // far enough to be a separate jump
          right = o.x + o.w; h = Math.max(h, o.h);
        }
        const span = right - left;
        const [up, down] = jumpWindow(h, G, V);
        // the obstacle must enter after the player is high enough and exit before they land
        const lower = 89 + speed * up;               // jumping later than this clips the front
        const upper = 73 - span + speed * down;      // jumping earlier than this clips the back
        if (upper <= lower) lastKind = next.kind + "!IMPOSSIBLE";
        else lastKind = next.kind + (right > next.x + next.w ? "+grp" : "");
        // players aim a little early of centre, because late is fatal and early is survivable
        const target = upper - (upper - lower) * 0.35 + gauss(br) * (upper - lower) * 0.18 * sk.noise;
        if (left <= Math.max(lower, Math.min(upper, target))) fire = true;
      }
    }
    const tap = fire && s.onGround;
    if (tap) fire = false;
    rentSim.step(s, tap);
  }
  return { score: rentSim.score(s), cause: lastKind || "?", ticks: s.tick };
}

// ---------- slumlord ----------
function playSlum(seed: number, sk: Skill): { score: number; cause: string; ticks: number } {
  const s: SlumlordState = slumlordSim.init(seed);
  const br = new Rng(seed * 7 + 3);
  // Stacking is a timing press, not a reaction: the block is visible and predictable,
  // so skill is how precisely you hit the moment, in ticks.
  let pressAt = -1;
  while (!s.dead && s.tick < MAX_TICKS) {
    const top = s.floors[s.floors.length - 1]!;
    const c = s.cur;
    if (pressAt < 0) {
      const toAlign = (top.x - c.x) / (c.dir * c.speed);
      if (toAlign >= 0 && toAlign <= 12) {
        pressAt = s.tick + Math.max(0, Math.round(toAlign + gauss(br) * sk.press));
      }
    }
    const tap = pressAt === s.tick;
    if (tap) pressAt = -1;
    slumlordSim.step(s, tap);
    if (pressAt >= 0 && pressAt < s.tick) pressAt = -1;
  }
  const top = s.floors[s.floors.length - 1]!;
  return { score: slumlordSim.score(s), cause: `w${Math.round(top.w)}`, ticks: s.tick };
}

const GAMES = { pigeon: playPigeon, rent: playRent, slumlord: playSlum } as const;
const only = process.argv[3] as keyof typeof GAMES | undefined;
for (const [name, play] of Object.entries(GAMES)) {
  if (only && name !== only) continue;
  console.log(`\n== ${name} (v${{ pigeon: pigeonSim, rent: rentSim, slumlord: slumlordSim }[name as keyof typeof GAMES].version}) ==`);
  console.log("skill     mean   p10   p50   p90   max   secs   top causes");
  for (const sk of SKILLS) {
    const scores: number[] = []; const causes = new Map<string, number>(); const secs: number[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const r = play(seed, sk); scores.push(r.score); secs.push(r.ticks / 60); causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
    }
    const st = stats(scores);
    const top = [...causes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round((100 * v) / N)}%`).join(", ");
    const med = stats(secs).p50;
    console.log(`${sk.name.padEnd(9)} ${String(st.mean).padStart(5)} ${String(st.p10).padStart(5)} ${String(st.p50).padStart(5)} ${String(st.p90).padStart(5)} ${String(st.max).padStart(5)} ${String(Math.round(med)).padStart(5)}s   ${top}`);
  }
}
