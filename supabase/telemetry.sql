-- Evidence for settling a disputed payout. The privacy page already promises
-- we keep this; it was promised but never collected.
alter table public.runs add column if not exists sim_version int;
alter table public.runs add column if not exists ip_hash text;
alter table public.runs add column if not exists country text;
alter table public.runs add column if not exists user_agent text;
alter table public.runs add column if not exists wall_ms int;
alter table public.runs add column if not exists tap_sd_ms real;

-- Replays are evidence, not public reading material: studying a winning replay
-- is a head start for the next cheater, and the old policy exposed user_id too.
drop policy if exists "read verified runs" on public.runs;

-- The leaderboard view should expose a handle and a score, nothing else.
drop view if exists public.weekly_leaderboard;
create view public.weekly_leaderboard as
select distinct on (r.week, r.game, r.user_id)
  r.week, r.game, p.handle, r.score, r.finished_at, r.sim_version
from public.runs r
join public.profiles p on p.id = r.user_id
where r.score is not null and not p.banned
order by r.week, r.game, r.user_id, r.score desc, r.finished_at asc;
