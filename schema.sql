-- شغّل هذا الملف في Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (char_length(phone) between 5 and 30),
  email text,
  requester_type text not null,
  activity_type text not null,
  appointment_date date not null,
  appointment_time time not null,
  location text not null,
  details text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

alter table public.appointments enable row level security;
alter table public.admin_users enable row level security;

-- Admins only can read/update appointment rows.
drop policy if exists "admins read appointments" on public.appointments;
create policy "admins read appointments" on public.appointments
for select to authenticated using (public.is_admin());

drop policy if exists "admins update appointments" on public.appointments;
create policy "admins update appointments" on public.appointments
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Allow anonymous visitors to submit requests only.
drop policy if exists "visitors submit appointments" on public.appointments;
create policy "visitors submit appointments" on public.appointments
for insert to anon, authenticated with check (
  status = 'pending'
  and char_length(full_name) between 2 and 120
  and char_length(phone) between 5 and 30
  and appointment_date >= current_date
);

-- Avoid simultaneous double-booking of the same requested time for non-rejected bookings.
-- If several types of coverage may happen at the same time, adjust this rule to your workflow.
create unique index if not exists appointments_unique_active_slot
on public.appointments (appointment_date, appointment_time)
where status in ('pending','approved');

-- Update timestamp automatically.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists appointments_updated_at on public.appointments;
create trigger appointments_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

-- Limited status lookup by phone. It returns no name, email, or details.
-- For stronger privacy, replace phone-only lookup with a random tracking code sent to the requester.
create or replace function public.lookup_my_appointments(p_phone text)
returns table(activity_type text, appointment_date date, appointment_time time, location text, status text)
language sql security definer set search_path = public
as $$
  select a.activity_type, a.appointment_date, a.appointment_time, a.location, a.status
  from public.appointments a
  where a.phone = left(trim(p_phone),30)
  order by a.created_at desc
  limit 10;
$$;
revoke all on function public.lookup_my_appointments(text) from public;
grant execute on function public.lookup_my_appointments(text) to anon, authenticated;

-- After creating the first admin user in Authentication > Users, run this separately:
-- insert into public.admin_users (user_id)
-- values ('PASTE-THE-ADMIN-USER-UUID-HERE');
