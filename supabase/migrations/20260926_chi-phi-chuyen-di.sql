-- =====================================================================
-- Migration: bảng chi phí chuyến đi (trip_expenses) và RLS.
-- Chạy sau 20260925_anh-nho.sql. Dán vào Supabase SQL Editor, bấm Run; chạy lại nhiều lần vẫn được.
-- Nội dung giống supabase/schema.sql.
-- =====================================================================

begin;

-- =====================================================================
-- Chi phí chuyến đi: ai trong chuyến (chủ, thành viên) cũng xem và thêm khoản chi;
-- người tạo hoặc chủ chuyến xoá được. Không sửa: xoá rồi thêm lại. Chia tiền tính ở client.
-- Tiền VND, số nguyên. split_among: những người chia khoản này (đều phải đang ở trong chuyến lúc thêm).
-- =====================================================================
create table if not exists public.trip_expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users on delete cascade,
  paid_by      uuid not null references public.profiles on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  amount       bigint not null check (amount > 0 and amount <= 100000000000),
  spent_on     date not null default current_date,
  split_among  uuid[] not null check (cardinality(split_among) between 1 and 50),
  created_at   timestamptz not null default now()
);

create index if not exists trip_expenses_trip_idx on public.trip_expenses (trip_id, spent_on);

alter table public.trip_expenses enable row level security;

drop policy if exists "trip_expenses_select" on public.trip_expenses;
create policy "trip_expenses_select" on public.trip_expenses
  for select to authenticated
  using (private.in_trip(trip_id, (select auth.uid())));

drop policy if exists "trip_expenses_insert" on public.trip_expenses;
create policy "trip_expenses_insert" on public.trip_expenses
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.in_trip(trip_id, (select auth.uid()))
    and private.in_trip(trip_id, paid_by)
    and (select bool_and(private.in_trip(trip_id, u)) from unnest(split_among) as u)
  );

drop policy if exists "trip_expenses_delete" on public.trip_expenses;
create policy "trip_expenses_delete" on public.trip_expenses
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );

commit;
