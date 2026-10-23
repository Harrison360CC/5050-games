-- Sponsor ineligibility.
--
-- Rules section 4 says employees and household members of the sponsor cannot
-- win. The sponsor plays his own games under the handle 5050GameGod, and until
-- now nothing in the schema enforced that: the leaderboard filtered on `banned`
-- and nothing else, so the person funding the pot could have ended a week on
-- top of it. On a $1.69 pot that is a curiosity. On the first pot anyone cares
-- about it is the end of the project.
--
-- He is marked ineligible rather than hidden. His runs stay on the board and in
-- the plays log with a label, because a handle that quietly disappears from a
-- leaderboard is exactly what a sceptic expects to find.

alter table public.profiles
  add column if not exists ineligible boolean not null default false;

comment on column public.profiles.ineligible is
  'Cannot take a pot (sponsor, household, staff). Still plays, still ranks, still shown.';

update public.profiles set ineligible = true where handle = '5050GameGod';

-- Not in the player-writable grant: `revoke`/`grant update (handle, is_adult,
-- payout_email)` in nicknames.sql already means a client cannot set this. Said
-- out loud here so a later widening of that grant is an obvious mistake.

drop view if exists public.weekly_leaderboard;
create view public.weekly_leaderboard as
select distinct on (r.week, r.game, r.user_id)
  r.week, r.game, p.handle, r.score, r.finished_at, r.sim_version,
  p.ineligible
from public.runs r
join public.profiles p on p.id = r.user_id
where r.score is not null and not p.banned
order by r.week, r.game, r.user_id, r.score desc, r.finished_at asc;

grant select on public.weekly_leaderboard to anon, authenticated;
