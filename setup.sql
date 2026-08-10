-- ============================================================
-- Capacity Tracker — Supabase schema
-- Run this once in the Supabase SQL Editor for your project.
-- ============================================================

-- ── Profiles ──────────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  bodyweight_kg  numeric(6,2) not null default 80,
  updated_at     timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can manage own profile"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Program days (e.g. "Day 1", "Day 2", "Day 3") ──────────
create table if not exists public.program_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz default now()
);

alter table public.program_days enable row level security;

create policy "Users can manage own program days"
  on public.program_days for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists program_days_user_idx on public.program_days(user_id);

-- ── Program exercises ───────────────────────────────────────
create table if not exists public.program_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day_id       uuid not null references public.program_days(id) on delete cascade,
  name         text not null,
  sets         int not null default 3,
  rep_lo       int not null default 8,
  rep_hi       int not null default 10,
  base_weight  numeric(7,2) not null default 20,
  increment    numeric(6,2) not null default 2.5,
  per_leg      boolean not null default false,
  bodyweight   boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz default now()
);

alter table public.program_exercises enable row level security;

create policy "Users can manage own program exercises"
  on public.program_exercises for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists program_exercises_user_idx on public.program_exercises(user_id);
create index if not exists program_exercises_day_idx on public.program_exercises(day_id);

-- ── Sessions (one logged workout) ──────────────────────────
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  day_id        uuid references public.program_days(id) on delete set null,
  day_name      text not null,
  performed_at  timestamptz not null default now(),
  created_at    timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "Users can manage own sessions"
  on public.sessions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists sessions_user_idx on public.sessions(user_id);
create index if not exists sessions_performed_idx on public.sessions(performed_at);

-- ── Session entries (one exercise within a logged session) ─
create table if not exists public.session_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_id     uuid not null references public.sessions(id) on delete cascade,
  exercise_id    uuid references public.program_exercises(id) on delete set null,
  exercise_name  text not null,
  per_leg        boolean not null default false,
  bodyweight     boolean not null default false,
  rpe            int,
  note           text,
  sort_order     int not null default 0,
  created_at     timestamptz default now()
);

alter table public.session_entries enable row level security;

create policy "Users can manage own session entries"
  on public.session_entries for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists session_entries_user_idx on public.session_entries(user_id);
create index if not exists session_entries_session_idx on public.session_entries(session_id);

-- ── Session sets (one working set within a session entry) ─
create table if not exists public.session_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_id   uuid not null references public.session_entries(id) on delete cascade,
  set_num    int not null,
  weight     numeric(7,2) not null default 0,
  reps       int not null default 0
);

alter table public.session_sets enable row level security;

create policy "Users can manage own session sets"
  on public.session_sets for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists session_sets_user_idx on public.session_sets(user_id);
create index if not exists session_sets_entry_idx on public.session_sets(entry_id);

-- ── Auto-create profile on signup ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
