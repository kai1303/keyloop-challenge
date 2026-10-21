create table public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(btrim(customer_name)) > 0),
  email text not null,
  phone text not null,
  vehicle_interest text not null,
  enquiry text not null,
  source text not null default 'Dealership website',
  received_at timestamptz not null default now()
);

create table public.sales_lead_activities (
  id uuid primary key,
  lead_id uuid not null references public.sales_leads(id),
  note text not null check (
    note = btrim(note)
    and char_length(btrim(note, E' \t\n\r\f' || chr(11))) between 1 and 2000
  ),
  created_at timestamptz(3) not null default clock_timestamp()
);

create index sales_leads_received_idx
  on public.sales_leads (received_at desc, id);
create index sales_lead_activities_history_idx
  on public.sales_lead_activities (lead_id, created_at, id);

alter table public.sales_leads enable row level security;
alter table public.sales_lead_activities enable row level security;
revoke all on public.sales_leads from anon, authenticated;
revoke all on public.sales_lead_activities from anon, authenticated;
grant select, insert, update, delete on public.sales_leads to service_role;
grant select, insert, update, delete on public.sales_lead_activities to service_role;
