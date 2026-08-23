-- Company operator org: seats, roles, invites, promo codes, credits grant.

create table if not exists public.operator_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ResumePreps',
  slug text not null unique default 'resumepreps',
  seat_limit integer not null default 25,
  global_auto_apply boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.operator_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support', 'billing', 'engineer', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table if not exists public.operator_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.operator_orgs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'support', 'billing', 'engineer', 'viewer')),
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists operator_invites_email_idx on public.operator_invites (lower(email));
create index if not exists operator_members_user_idx on public.operator_members (user_id);

create table if not exists public.operator_promo_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.operator_orgs(id) on delete cascade,
  code text not null unique,
  kind text not null default 'promo' check (kind in ('promo', 'referral')),
  percent_off integer,
  credits_grant integer,
  max_redemptions integer,
  times_redeemed integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.operator_impersonations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.operator_orgs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.operator_orgs enable row level security;
alter table public.operator_members enable row level security;
alter table public.operator_invites enable row level security;
alter table public.operator_promo_codes enable row level security;
alter table public.operator_impersonations enable row level security;

create or replace function public.grant_credits(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance integer;
begin
  if p_delta = 0 then
    select balance into next_balance from public.credit_balances where user_id = p_user_id;
    return coalesce(next_balance, 0);
  end if;

  insert into public.credit_ledger (user_id, delta, reason, metadata)
  values (p_user_id, p_delta, p_reason, coalesce(p_metadata, '{}'::jsonb));

  insert into public.credit_balances (user_id, balance, lifetime_granted, lifetime_spent)
  values (
    p_user_id,
    greatest(p_delta, 0),
    greatest(p_delta, 0),
    0
  )
  on conflict (user_id) do update
    set balance = public.credit_balances.balance + p_delta,
        lifetime_granted = public.credit_balances.lifetime_granted + greatest(p_delta, 0),
        lifetime_spent = public.credit_balances.lifetime_spent + greatest(-p_delta, 0),
        updated_at = now();

  select balance into next_balance from public.credit_balances where user_id = p_user_id;
  return coalesce(next_balance, 0);
end;
$$;

create unique index if not exists credit_ledger_plan_session
  on public.credit_ledger ((metadata->>'stripe_session_id'))
  where reason = 'plan_grant' and metadata->>'stripe_session_id' is not null;

insert into public.operator_orgs (name, slug, seat_limit)
values ('ResumePreps', 'resumepreps', 25)
on conflict (slug) do nothing;
