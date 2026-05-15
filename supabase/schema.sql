-- Core schema MVP with user_id scoping and RLS enabled.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  business_name text,
  siret text,
  address text,
  activity_type text,
  default_regime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  company_name text,
  email text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references clients(id),
  invoice_number text not null,
  issue_date date not null,
  due_date date,
  payment_date date,
  status text not null check (status in ('draft','sent','paid','overdue','cancelled')),
  total_ttc numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  invoice_id uuid references invoices(id),
  client_id uuid references clients(id),
  amount numeric(12,2) not null,
  payment_date date not null,
  is_professional_revenue boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  are_daily_amount numeric(8,2) not null,
  theoretical_monthly_days integer not null,
  remaining_are_days integer not null,
  bnc_abatement_rate numeric(5,2) not null,
  france_travail_deduction_rate numeric(5,2) not null,
  total_urssaf_rate numeric(5,2) not null,
  prudent_tax_rate numeric(5,2) not null,
  versement_liberatoire_enabled boolean not null default false,
  versement_liberatoire_rate numeric(5,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table clients enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table settings enable row level security;

create policy "profiles_owner" on profiles using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clients_owner" on clients using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoices_owner" on invoices using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "payments_owner" on payments using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_owner" on settings using (auth.uid() = user_id) with check (auth.uid() = user_id);
