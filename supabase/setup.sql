-- Выполнить в Supabase > SQL Editor один раз.
-- В Authentication > Providers нужно включить Anonymous Sign-Ins.
-- Справочник подарков хранит разрешение на совместную бронь на стороне базы,
-- чтобы браузер не мог изменить правила для конкретного подарка.
create table if not exists public.gift_catalog (
  id integer primary key,
  multi boolean not null default false
);

insert into public.gift_catalog (id, multi) values
(1, false),
(2, false),
(3, true),
(4, false),
(5, true),
(6, true),
(7, false),
(8, false),
(9, true),
(10, false),
(11, false),
(12, false),
(14, false),
(15, true),
(16, true),
(17, true),
(18, false),
(19, false),
(20, false),
(21, true),
(22, true),
(23, true),
(24, true),
(25, true),
(26, true),
(27, true),
(28, true),
(29, true),
(30, true),
(31, true)
on conflict (id) do update set multi = excluded.multi;

create table if not exists public.gift_reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id integer not null references public.gift_catalog(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram text not null check (telegram ~ '^@[A-Za-z][A-Za-z0-9_]{4,31}$'),
  created_at timestamptz not null default now(),
  constraint one_reservation_per_user_per_gift unique (gift_id, user_id)
);
create index if not exists gift_reservations_gift_id_idx on public.gift_reservations (gift_id);

-- Блокировка записи gift_catalog обеспечивает атомарное выполнение запрета
-- на второе бронирование одиночного подарка даже при одновременных запросах.
create or replace function public.validate_gift_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  is_multi boolean;
begin
  select c.multi into is_multi from public.gift_catalog c where c.id=new.gift_id for update;
  if is_multi is null then raise exception 'unknown_gift'; end if;
  if not is_multi and exists(select 1 from public.gift_reservations r where r.gift_id=new.gift_id) then
    raise exception 'already_reserved';
  end if;
  return new;
end;
$$;
drop trigger if exists check_gift_reservation on public.gift_reservations;
create trigger check_gift_reservation before insert on public.gift_reservations
for each row execute function public.validate_gift_reservation();

alter table public.gift_catalog enable row level security;
alter table public.gift_reservations enable row level security;

-- Убираем старые политики, чтобы скрипт можно было запускать повторно.
drop policy if exists gift_catalog_public_read on public.gift_catalog;
create policy gift_catalog_public_read on public.gift_catalog for select to anon, authenticated using (true);
drop policy if exists gifts_public_read on public.gift_reservations;
create policy gifts_public_read on public.gift_reservations for select to anon, authenticated using (true);
drop policy if exists gifts_insert_own on public.gift_reservations;
create policy gifts_insert_own on public.gift_reservations for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists gifts_delete_own on public.gift_reservations;
create policy gifts_delete_own on public.gift_reservations for delete to authenticated
using (auth.uid() = user_id);

-- Клиент не получает прав менять брони через UPDATE или управлять каталогом.
revoke all on public.gift_catalog from anon, authenticated;
grant select on public.gift_catalog to anon, authenticated;
revoke all on public.gift_reservations from anon, authenticated;
grant select on public.gift_reservations to anon, authenticated;
grant insert, delete on public.gift_reservations to authenticated;
