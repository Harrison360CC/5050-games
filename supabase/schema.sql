-- 5050 Games schema. Run in the Supabase SQL editor.
-- Auth users come from Supabase Auth (auth.users). We only add a public profile.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  is_adult boolean not null default false,       -- self-declared 18+, required to win
  payout_email text,                             -- PayPal / e-transfer address, set at claim time
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null check (game in ('pigeon','rent','slumlord')),
  week text not null,                            -- '2026-W43', set by the Worker
  seed bigint not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int,                                     -- null until verified
  ticks int,
  replay jsonb,                                  -- kept for audit and public replays
  rejected_reason text
);
create index runs_week_game_score on public.runs (week, game, score desc) where score is not null;
create index runs_user_started on public.runs (user_id, started_at desc);

-- One row per game per week. Pot = 50% ad net + 50% merch profit + founder seed + rollover.
create table public.weeks (
  week text not null,
  game text not null,
  ad_revenue_cents int not null default 0,       -- net from AdSense, entered after payout report
  ad_estimate_cents int not null default 0,      -- running estimate shown during the week
  merch_profit_cents int not null default 0,     -- profit after print, ship, fees
  seed_cents int not null default 0,             -- founder's pot, stated publicly
  rollover_cents int not null default 0,         -- unclaimed money from prior weeks
  winner_run_id uuid references public.runs(id),
  payout_cents int generated always as (
    ad_revenue_cents / 2 + merch_profit_cents / 2 + seed_cents + rollover_cents
  ) stored,
  claimed_at timestamptz,
  paid_at timestamptz,
  primary key (week, game)
);

-- Best verified run per user per game per week, for the leaderboard.
create view public.weekly_leaderboard as
select distinct on (r.week, r.game, r.user_id)
  r.week, r.game, r.user_id, p.handle, r.score, r.finished_at, r.id as run_id
from public.runs r
join public.profiles p on p.id = r.user_id
where r.score is not null and not p.banned
order by r.week, r.game, r.user_id, r.score desc, r.finished_at asc;

-- RLS: clients can read the leaderboard and their own profile. Nobody but the
-- service role (the Worker) can write runs. That is the whole anti-cheat story.
alter table public.profiles enable row level security;
alter table public.runs enable row level security;
alter table public.weeks enable row level security;

create policy "read own profile" on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "read verified runs" on public.runs for select using (score is not null);
create policy "read weeks" on public.weeks for select using (true);
-- no insert/update policies on runs or weeks for anon/authenticated: service role only.

-- complaints from the site. no auto-email; read them in the dashboard.
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  who text check (who in ('karen','chad')),
  email text not null,
  body text not null check (length(body) <= 2000),
  created_at timestamptz not null default now()
);
alter table public.complaints enable row level security;
