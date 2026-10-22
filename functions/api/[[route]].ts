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
    if (req.method === "GET" && path === "/pots") return pots(env);
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
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const [row] = await sb(env, "runs", { method: "POST", body: { user_id: user.id, game, seed, week: weekKey() } });
  return json({ runId: row.id, seed });
}

async function finishRun(req: Request, env: Env) {
  const user = await requireUser(req, env);
  const { runId, replay } = (await req.json()) as { runId: string; replay: Replay };
  const [run] = await sb(env, `runs?id=eq.${runId}&user_id=eq.${user.id}&select=*`);
  if (!run) return json({ ok: false, reason: "no such run" }, 404);
  if (run.score !== null) return json({ ok: false, reason: "already finished" }, 409);
  if (Date.now() - Date.parse(run.started_at) > RUN_TTL_MS) return json({ ok: false, reason: "run expired" }, 410);
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

async function pots(env: Env) {
  const rows = await sb(env, `weeks?week=eq.${weekKey()}&select=game,ad_estimate_cents,ad_revenue_cents,merch_profit_cents,seed_cents,rollover_cents,payout_cents,paid_at`);
  const out: Record<string, unknown> = {};
  for (const g of GAMES) {
    const r = rows.find((x: any) => x.game === g);
    const est = r ? Math.floor(r.ad_estimate_cents / 2) + Math.floor(r.merch_profit_cents / 2) + r.seed_cents + r.rollover_cents : 0;
    out[g] = r ? { ...r, est_pot_cents: est, confirmed: r.ad_revenue_cents > 0 } : { est_pot_cents: 0, confirmed: false };
  }
  return json({ week: weekKey(), pots: out }, 200, 60);
}

async function complain(req: Request, env: Env) {
  const { who, email, body } = (await req.json()) as { who: string; email: string; body: string };
  if (!email || !body || body.length > 2000) return json({ error: "need an email and a complaint" }, 400);
  await sb(env, "complaints", { method: "POST", body: { who, email, body } });
  return json({ ok: true });
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
