-- Crew dashboard race log. Paste into Supabase → SQL Editor → Run, once.
-- Crew-only: sign-ups are switched off in the dashboard (Authentication →
-- Sign In / Providers → "Allow new users to sign up" OFF), so "authenticated"
-- means a crew account created by hand. Anonymous visitors see nothing.

-- One row per intake entry. Imported entries keep the id from Laura's app, so
-- importing her export again cannot double-count. Undo sets deleted_at; rows
-- are never removed, so the race record stays complete.
create table if not exists public.intake_events (
  id          text primary key,
  yard        integer not null check (yard >= 1),
  at          timestamptz not null,
  kind        text check (kind in ('food', 'drink')),
  drink_kind  text,
  ml          numeric check (ml >= 0),
  carbs_g     numeric check (carbs_g >= 0),
  text        text not null default '',
  source      text not null default 'dashboard' check (source in ('dashboard', 'laura-app-import')),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index if not exists intake_events_yard on public.intake_events (yard);

-- One row per yard: when she came back in. Official laps from the timing feed
-- are saved here too, so the record survives even if raceresult.com changes.
create table if not exists public.yard_returns (
  yard        integer primary key check (yard >= 1),
  finish      timestamptz not null,
  lap_ms      integer check (lap_ms > 0 and lap_ms < 3600000),
  source      text not null check (source in ('official', 'manual')),
  updated_at  timestamptz not null default now()
);

alter table public.intake_events enable row level security;
alter table public.yard_returns  enable row level security;

-- Crew can read, add and edit. No delete policy on purpose.
drop policy if exists crew_read   on public.intake_events;
drop policy if exists crew_insert on public.intake_events;
drop policy if exists crew_update on public.intake_events;
create policy crew_read   on public.intake_events for select to authenticated using (true);
create policy crew_insert on public.intake_events for insert to authenticated with check (true);
create policy crew_update on public.intake_events for update to authenticated using (true) with check (true);

drop policy if exists crew_read   on public.yard_returns;
drop policy if exists crew_insert on public.yard_returns;
drop policy if exists crew_update on public.yard_returns;
create policy crew_read   on public.yard_returns for select to authenticated using (true);
create policy crew_insert on public.yard_returns for insert to authenticated with check (true);
create policy crew_update on public.yard_returns for update to authenticated using (true) with check (true);

-- Push changes to the iPad the moment they are saved.
do $$ begin
  alter publication supabase_realtime add table public.intake_events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.yard_returns;
exception when duplicate_object then null; end $$;
