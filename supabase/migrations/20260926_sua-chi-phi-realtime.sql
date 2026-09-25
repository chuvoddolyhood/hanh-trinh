-- =====================================================================
-- Migration: sửa khoản chi (policy update) và cập nhật tức thì (Realtime) cho trip_expenses.
-- Chạy sau 20260926_chi-phi-chuyen-di.sql. Dán vào Supabase SQL Editor, bấm Run; chạy lại nhiều lần vẫn được.
-- Nội dung giống supabase/schema.sql.
-- =====================================================================

begin;

-- Sửa khoản chi: người tạo hoặc chủ chuyến; điều kiện giống lúc thêm (người trả, người chia đều đang ở trong chuyến)
drop policy if exists "trip_expenses_update" on public.trip_expenses;
create policy "trip_expenses_update" on public.trip_expenses
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  )
  with check (
    private.in_trip(trip_id, (select auth.uid()))
    and private.in_trip(trip_id, paid_by)
    and (select bool_and(private.in_trip(trip_id, u)) from unnest(split_among) as u)
  );

-- Cập nhật tức thì cho cả nhóm (Realtime tôn trọng RLS với INSERT, UPDATE; DELETE chỉ gửi khoá chính)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_expenses'
  ) then
    alter publication supabase_realtime add table public.trip_expenses;
  end if;
end;
$$;

commit;
