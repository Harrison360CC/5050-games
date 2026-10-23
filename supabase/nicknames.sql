-- Random nicknames at sign-up. No real names, no emails. Editable, unique (case-insensitive).
alter table public.profiles drop constraint if exists profiles_handle_check;
alter table public.profiles drop constraint if exists profiles_handle_key;
alter table public.profiles add constraint profiles_handle_check check (handle ~ '^[A-Za-z0-9_]{3,20}$');
create unique index if not exists profiles_handle_lower on public.profiles (lower(handle));

create or replace function public.random_handle() returns text language plpgsql as $$
declare
  adj text[] := array['Broke','Drunk','Evicted','Sleepy','Feral','Unpaid','Damp','Mid','Lukewarm','Overdue','Suspicious','Anonymous','Hungover','Moist','Tired','Haunted','Sketchy','Unlicensed','Discount','Nervous','Bootleg','Ominous'];
  noun text[] := array['Pigeon','Tenant','Landlord','Raccoon','Goblin','Intern','Gremlin','Cousin','Roommate','Accountant','Mailman','Lobster','Lawyer','Seagull','Dentist','Barista','Plumber','Uncle','Realtor','Wizard','Squirrel','Manager'];
  h text; n int := 0;
begin
  loop
    h := adj[1 + floor(random() * array_length(adj,1))] || noun[1 + floor(random() * array_length(noun,1))] || (10 + floor(random() * 90))::int::text;
    exit when not exists (select 1 from public.profiles where lower(handle) = lower(h));
    n := n + 1;
    if n > 50 then h := 'Player' || floor(random() * 1000000)::int::text; exit; end if;
  end loop;
  return h;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle) values (new.id, public.random_handle());
  return new;
end $$;

-- Players may change their nickname, adult flag and payout email. Nothing else (not banned).
revoke update on public.profiles from authenticated, anon;
grant update (handle, is_adult, payout_email) on public.profiles to authenticated;

update public.profiles set handle = '5050GameGod' where handle = 'harrisonolajos';
