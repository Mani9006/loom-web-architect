-- ResumePreps product rebuild: credit ledger, recipes, people, notes, apply-from, saved matches.

create table if not exists public.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 25,
  lifetime_granted integer not null default 25,
  lifetime_spent integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  draft_application_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists credit_ledger_submit_unique
  on public.credit_ledger (draft_application_id)
  where reason = 'submit' and draft_application_id is not null;

create unique index if not exists credit_ledger_refund_unique
  on public.credit_ledger (draft_application_id)
  where reason = 'refund' and draft_application_id is not null;

create table if not exists public.apply_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query text not null default '',
  enabled boolean not null default true,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.network_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text,
  title text,
  linkedin_url text,
  email text,
  notes text,
  application_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  company text,
  application_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apply_from_mailboxes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_part text not null unique,
  address text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  scanned_job_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, scanned_job_id)
);

alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.apply_recipes enable row level security;
alter table public.network_people enable row level security;
alter table public.research_notes enable row level security;
alter table public.apply_from_mailboxes enable row level security;
alter table public.saved_matches enable row level security;

create policy credit_balances_owner on public.credit_balances for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy credit_ledger_owner on public.credit_ledger for select using (auth.uid() = user_id);
create policy apply_recipes_owner on public.apply_recipes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy network_people_owner on public.network_people for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy research_notes_owner on public.research_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy apply_from_mailboxes_owner on public.apply_from_mailboxes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy saved_matches_owner on public.saved_matches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.ensure_credit_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_balances (user_id, balance, lifetime_granted)
  values (new.id, 25, 25)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_credit_balance on auth.users;
create trigger on_auth_user_credit_balance
  after insert on auth.users
  for each row execute function public.ensure_credit_balance();

create or replace function public.consume_application_credit(p_user_id uuid, p_draft_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance integer;
begin
  insert into public.credit_ledger (user_id, delta, reason, draft_application_id)
  values (p_user_id, -1, 'submit', p_draft_id)
  on conflict do nothing;

  if not found and exists (
    select 1 from public.credit_ledger
    where draft_application_id = p_draft_id and reason = 'submit'
  ) then
    select balance into next_balance from public.credit_balances where user_id = p_user_id;
    return coalesce(next_balance, 0);
  end if;

  insert into public.credit_balances (user_id, balance, lifetime_granted, lifetime_spent)
  values (p_user_id, 24, 25, 1)
  on conflict (user_id) do update
    set balance = public.credit_balances.balance - 1,
        lifetime_spent = public.credit_balances.lifetime_spent + 1,
        updated_at = now();

  select balance into next_balance from public.credit_balances where user_id = p_user_id;
  return coalesce(next_balance, 0);
end;
$$;

create or replace function public.refund_application_credit(p_user_id uuid, p_draft_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance integer;
begin
  if not exists (
    select 1 from public.credit_ledger
    where draft_application_id = p_draft_id and reason = 'submit'
  ) then
    select balance into next_balance from public.credit_balances where user_id = p_user_id;
    return coalesce(next_balance, 0);
  end if;

  insert into public.credit_ledger (user_id, delta, reason, draft_application_id)
  values (p_user_id, 1, 'refund', p_draft_id)
  on conflict do nothing;

  update public.credit_balances
    set balance = balance + 1,
        lifetime_spent = greatest(lifetime_spent - 1, 0),
        updated_at = now()
    where user_id = p_user_id;

  select balance into next_balance from public.credit_balances where user_id = p_user_id;
  return coalesce(next_balance, 0);
end;
$$;
