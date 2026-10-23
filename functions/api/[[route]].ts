/**
 * Cloudflare Pages Function: the only thing that can write a score.
 * Deployed automatically with the site. Secrets live in the Pages project
 * settings (SUPABASE_SERVICE_KEY). SUPABASE_URL is public.
 *
 *   POST /api/run/start    { game }           -> { runId, seed }
 *   POST /api/run/finish   { runId, replay }  -> { ok, score } | { ok:false, reason }
 *   GET  /api/leaderboard/:game               -> { week, rows }
 *   GET  /api/pots                            -> { week, pots: { game: {...} } }
 *   POST /api/complain     { who, email, body } -> { ok }   (stored; no auto-email)
 */
import { verify } from "../../src/sim/verify";
import SEED from "../../seed.json";
import LEDGER from "../../ledger.json";
import type { Replay } from "../../src/sim/types";

interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }

const GAMES = new Set(["pigeon", "rent", "slumlord"]);
const RUN_TTL_MS = 25 * 60 * 1000;
const MAX_RUNS_PER_MIN = 12;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request: req, env } = ctx;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  try {
    if (req.method === "POST" && path === "/run/start") return startRun(req, env);
    if (req.method === "POST" && path === "/run/finish") return finishRun(req, env);
    if (req.method === "POST" && path === "/complain") return complain(req, env);
    if (req.method === "GET" && path.startsWith("/leaderboard/")) return leaderboard(path.split("/")[2] ?? "", env);
    if (req.method === "GET" && path === "/pots") return pots();
    if (req.method === "GET" && path === "/plays") return plays(env);
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: String(e) }, 500);
  }
};

async function startRun(req: Request, env: Env) {
  const user = await requireUser(req, env);
  const { game } = (await req.json()) as { game: string };
  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);
  const [prof] = await sb(env, `profiles?id=eq.${user.id}&select=is_adult,banned`);
  if (!prof || prof.banned) return json({ error: "account can't play ranked" }, 403);
  if (!prof.is_adult) return json({ error: "confirm you're 18+ first" }, 403);
  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = await sb(env, `runs?user_id=eq.${user.id}&started_at=gte.${since}&select=id`);
  if (recent.length >= MAX_RUNS_PER_MIN) return json({ error: "slow down" }, 429);
  // Everyone's Nth ranked run of the week on a given game gets the SAME seed.
  // Abandoning a run to fish for an easy course gains you nothing, because the
  // next seed is already decided and is the same one everyone else faces. It
  // also means we can say, on the record, that every entrant played the same
  // courses in the same order.
  const week = weekKey();
  const mine = await sb(env, `runs?user_id=eq.${user.id}&game=eq.${game}&week=eq.${week}&select=id`);
  const seed = courseSeed(week, game, mine.length);
  const [row] = await sb(env, "runs", { method: "POST", body: { user_id: user.id, game, seed, week } });
  return json({ runId: row.id, seed, course: mine.length + 1 });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function finishRun(req: Request, env: Env) {
  const user = await requireUser(req, env);
  const { runId, replay } = (await req.json()) as { runId: string; replay: Replay };
  // Never concatenate unvalidated input into a query: a trailing "#" would turn
  // the rest of the query string into a URL fragment and drop the ownership filter.
  if (!UUID.test(String(runId))) return json({ ok: false, reason: "bad run id" }, 400);
  const [run] = await sb(env, `runs?id=eq.${runId}&user_id=eq.${user.id}&select=*`);
  if (!run) return json({ ok: false, reason: "no such run" }, 404);
  // Idempotent: a retry after a submit we already accepted returns the score
  // rather than reading as another failure.
  if (run.score !== null) return json({ ok: true, score: run.score, already: true });
  // One attempt per run. Without this you could keep re-submitting against the
  // same seed until something verified, which is the whole economics of
  // solving a course offline.
  if (run.rejected_reason) return json({ ok: false, reason: "run already submitted" }, 409);
  const elapsedMs = Date.now() - Date.parse(run.started_at);
  if (elapsedMs > RUN_TTL_MS) return json({ ok: false, reason: "run expired" }, 410);
  // A replay has to have taken about as long to play as it claims to last.
  // Without this you can start a run, solve the course offline, and post a
  // three-minute replay ten seconds later.
  const claimedMs = (replay.endTick / 60) * 1000;
  if (elapsedMs < claimedMs * 0.8) return json({ ok: false, reason: "submitted faster than it could be played" }, 400);
  // The week is decided by when the run FINISHED. Stamping it at the start let
  // you hold runs open across the boundary, read the final board, and then post
  // exactly the score you needed into a week that had already closed.
  if (run.week !== weekKey()) return json({ ok: false, reason: "run crossed the week boundary" }, 409);
  if (replay.seed !== Number(run.seed) || replay.game !== run.game) return json({ ok: false, reason: "replay does not match run" }, 400);
  const result = verify(replay);
  if (!result.ok) {
    await sb(env, `runs?id=eq.${runId}`, { method: "PATCH", body: { rejected_reason: result.reason, replay } });
    return json({ ok: false, reason: result.reason }, 400);
  }
  await sb(env, `runs?id=eq.${runId}`, { method: "PATCH", body: { score: result.score, ticks: result.ticks, replay, finished_at: new Date().toISOString() } });
  return json({ ok: true, score: result.score });
}

async function leaderboard(game: string, env: Env) {
  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);
  const rows = await sb(env, `weekly_leaderboard?game=eq.${game}&week=eq.${weekKey()}&select=handle,score,finished_at&order=score.desc,finished_at.asc&limit=50`);
  return json({ week: weekKey(), rows }, 200, 30);
}

type Entry = { date: string; game: string; kind: string; cents: number; note?: string };
const SEEDS = SEED as unknown as Record<string, number>;
const ENTRIES = (LEDGER as unknown as { entries: Entry[] }).entries;

/** How many cents of an entry land in ONE game's pot. */
function potShare(e: Entry, game: string): number {
  // Split the half first, then share it, so small amounts don't round away to
  // nothing. Flooring twice turned 100c of ad money into 48c of pot, and
  // anything under 6c into zero, while the rules promise half.
  const half = e.kind === "ads" || e.kind === "merch" ? e.cents / 2 : e.cents;
  const mine = e.game === game ? half : e.game === "all" ? half / 3 : 0;
  if (e.kind === "ads" || e.kind === "merch") return Math.round(mine);
  if (e.kind === "seed" || e.kind === "rollover") return Math.round(mine);
  if (e.kind === "payout") return -Math.round(mine);
  return 0;
}

function pots() {
  const week = weekKey();
  const out: Record<string, unknown> = {};
  for (const g of GAMES) {
    const seed = SEEDS[g] ?? 0;
    let ads = 0, merch = 0, rollover = 0;
    for (const e of ENTRIES) {
      if (weekKey(new Date(e.date + "T12:00:00Z")) !== week) continue;
      const share = potShare(e, g);
      if (e.kind === "ads") ads += share;
      else if (e.kind === "merch") merch += share;
      else if (e.kind === "rollover" || e.kind === "seed" || e.kind === "payout") rollover += share;
    }
    out[g] = { seed_cents: seed, ads_cents: ads, merch_cents: merch, rollover_cents: rollover, est_pot_cents: seed + ads + merch + rollover, confirmed: false };
  }
  return json({ week, pots: out, entries: ENTRIES.slice().reverse() }, 200, 60);
}

async function plays(env: Env) {
  const week = weekKey();
  const rows = await sb(env, `runs?select=game,score,finished_at,profiles(handle)&score=not.is.null&week=eq.${week}&order=finished_at.desc&limit=100`);
  // rank each run against the current week board for its game (best per player)
  const boards: Record<string, { handle: string; score: number }[]> = {};
  for (const g of GAMES) boards[g] = await sb(env, `weekly_leaderboard?game=eq.${g}&week=eq.${week}&select=handle,score&order=score.desc,finished_at.asc&limit=25`);
  const out = rows.map((r: any) => {
    const handle = r.profiles?.handle ?? "?";
    const idx = boards[r.game]!.findIndex((b) => b.handle === handle && b.score === r.score);
    return { game: r.game, score: r.score, at: r.finished_at, handle, rank: idx >= 0 ? idx + 1 : null };
  });
  return json({ week, plays: out }, 200, 30);
}

async function complain(req: Request, env: Env) {
  const { who, email, body } = (await req.json()) as { who: string; email: string; body: string };
  if (!email || !body || body.length > 2000) return json({ error: "need an email and a complaint" }, 400);
  await sb(env, "complaints", { method: "POST", body: { who, email, body } });
  return json({ ok: true });
}

/** Stable 32-bit seed for (week, game, run number). Pure, so it is reproducible. */
export function courseSeed(week: string, game: string, index: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${week}|${game}|${index}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // one extra avalanche so adjacent indices do not look related
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}

export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function requireUser(req: Request, env: Env): Promise<{ id: string }> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "sign in to post a score");
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) throw new HttpError(401, "bad token");
  const u = (await r.json()) as { id: string };
  return { id: u.id };
}

async function sb(env: Env, path: string, opts: { method?: string; body?: unknown } = {}): Promise<any[]> {
  if (!env.SUPABASE_SERVICE_KEY) throw new HttpError(503, "server not configured yet");
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method ?? "GET",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "content-type": "application/json", prefer: "return=representation" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new HttpError(500, `db ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function json(body: unknown, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(cacheSeconds ? { "cache-control": `public, max-age=${cacheSeconds}` } : {}) },
  });
}
