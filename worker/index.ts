/**
 * Cloudflare Worker: the only thing that can write a score.
 *
 *   POST /run/start   { game }                 -> { runId, seed }
 *   POST /run/finish  { runId, replay }        -> { ok, score } | { ok:false, reason }
 *   GET  /leaderboard/:game                    -> top 50 for the current week
 *
 * Auth: Supabase JWT in Authorization: Bearer. The Worker calls Supabase's
 * REST API with the SERVICE key so clients can never insert rows directly.
 * Row Level Security on `runs` is insert-denied for anon/authenticated roles.
 */
import { verify } from "../src/sim/verify";
import type { Replay } from "../src/sim/types";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_JWT_SECRET: string;
}

const GAMES = new Set(["pigeon", "rent", "slumlord"]);
const RUN_TTL_MS = 25 * 60 * 1000; // a run must finish within 25 min of starting
const MAX_RUNS_PER_MIN = 12;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/run/start") return startRun(req, env);
      if (req.method === "POST" && url.pathname === "/run/finish") return finishRun(req, env);
      if (req.method === "GET" && url.pathname.startsWith("/leaderboard/")) {
        return leaderboard(url.pathname.split("/")[2] ?? "", env);
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};

async function startRun(req: Request, env: Env) {
  const user = await requireUser(req, env);
  const { game } = (await req.json()) as { game: string };
  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);

  // crude rate limit: count runs started in the last minute
  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = await sb(env, `runs?user_id=eq.${user.id}&started_at=gte.${since}&select=id`);
  if (recent.length >= MAX_RUNS_PER_MIN) return json({ error: "slow down" }, 429);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const [row] = await sb(env, "runs", {
    method: "POST",
    body: { user_id: user.id, game, seed, week: weekKey() },
    prefer: "return=representation",
  });
  return json({ runId: row.id, seed });
}

async function finishRun(req: Request, env: Env) {
  const user = await requireUser(req, env);
  const { runId, replay } = (await req.json()) as { runId: string; replay: Replay };

  const [run] = await sb(env, `runs?id=eq.${runId}&user_id=eq.${user.id}&select=*`);
  if (!run) return json({ ok: false, reason: "no such run" }, 404);
  if (run.score !== null) return json({ ok: false, reason: "already finished" }, 409);
  if (Date.now() - Date.parse(run.started_at) > RUN_TTL_MS) return json({ ok: false, reason: "run expired" }, 410);
  if (replay.seed !== run.seed || replay.game !== run.game) return json({ ok: false, reason: "replay does not match run" }, 400);

  const result = verify(replay);
  if (!result.ok) {
    // keep the evidence; the weekly review looks at these
    await sb(env, `runs?id=eq.${runId}`, {
      method: "PATCH",
      body: { rejected_reason: result.reason, replay },
    });
    return json({ ok: false, reason: result.reason }, 400);
  }

  await sb(env, `runs?id=eq.${runId}`, {
    method: "PATCH",
    body: { score: result.score, ticks: result.ticks, replay, finished_at: new Date().toISOString() },
  });
  return json({ ok: true, score: result.score });
}

async function leaderboard(game: string, env: Env) {
  if (!GAMES.has(game)) return json({ error: "unknown game" }, 400);
  const rows = await sb(
    env,
    `weekly_leaderboard?game=eq.${game}&week=eq.${weekKey()}&order=score.desc,finished_at.asc&limit=50`,
  );
  return json({ week: weekKey(), rows });
}

/** ISO week key, Monday 00:00 UTC. e.g. "2026-W43" */
export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ---- helpers ----

async function requireUser(req: Request, env: Env): Promise<{ id: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "sign in to post a score");
  // Validate with Supabase auth endpoint (simplest; swap for local JWT verify later).
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new HttpError(401, "bad token");
  const u = (await r.json()) as { id: string };
  return { id: u.id };
}

async function sb(env: Env, path: string, opts: { method?: string; body?: unknown; prefer?: string } = {}): Promise<any[]> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method ?? "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: opts.prefer ?? "return=representation",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new HttpError(500, `supabase ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "https://play5050games.com" },
  });
}
