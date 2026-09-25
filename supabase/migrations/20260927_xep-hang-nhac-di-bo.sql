-- =====================================================================
-- Migration: bảng xếp hạng bạn bè (friend_leaderboard) và nhắc mục tiêu đi bộ (walk_reminders).
-- Chạy sau 20260926_sua-chi-phi-realtime.sql. Dán vào Supabase SQL Editor, bấm Run; chạy lại nhiều lần vẫn được.
-- Nội dung giống cuối supabase/schema.sql. Lịch gửi nhắc (pg_cron) xem README.
-- =====================================================================

begin;

-- =====================================================================
-- Bảng xếp hạng bạn bè và nhắc mục tiêu đi bộ
-- =====================================================================
-- leaderboard: tự chọn tham gia (mặc định tắt). Chỉ lộ số liệu tổng (số nơi, số ngày đi, km), không lộ vị trí.
-- walk_reminder, goal_km: nhắc lúc 20:00 nếu hôm nay chưa đi đủ goal_km (Edge Function walk-reminder).
alter table public.profiles add column if not exists leaderboard boolean not null default false;
alter table public.profiles add column if not exists walk_reminder boolean not null default false;
alter table public.profiles add column if not exists goal_km numeric(5, 1);
alter table public.profiles drop constraint if exists profiles_goal_km_check;
alter table public.profiles add constraint profiles_goal_km_check check (goal_km is null or goal_km between 0.5 and 100);

-- Mình và bạn bè cùng tham gia; trả rỗng nếu mình chưa tham gia. p_year null = mọi năm.
-- Năm của lộ trình tính theo giờ Việt Nam.
create or replace function public.friend_leaderboard(p_year int default null)
returns table (user_id uuid, display_name text, is_me boolean, places int, days int, km numeric)
language sql stable security definer
set search_path = public
as $$
  select pr.id,
         pr.display_name,
         pr.id = auth.uid(),
         (select count(*)::int from public.places pl
          where pl.user_id = pr.id and pl.kind = 'visited'
            and (p_year is null or extract(year from pl.visited_at) = p_year)),
         (select count(distinct pl.visited_at)::int from public.places pl
          where pl.user_id = pr.id and pl.kind = 'visited'
            and (p_year is null or extract(year from pl.visited_at) = p_year)),
         (select round(coalesce(sum(t.distance_m), 0)::numeric / 1000, 1) from public.tracks t
          where t.user_id = pr.id
            and (p_year is null or extract(year from t.started_at at time zone 'Asia/Ho_Chi_Minh') = p_year))
  from public.profiles pr
  where pr.leaderboard
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.leaderboard)
    and (pr.id = auth.uid() or private.are_friends(pr.id, auth.uid()));
$$;

revoke all on function public.friend_leaderboard(int) from public, anon;
grant execute on function public.friend_leaderboard(int) to authenticated;

-- Người bật nhắc, có thiết bị nhận thông báo, và hôm nay (giờ Việt Nam) chưa đi đủ mục tiêu.
-- Chỉ Edge Function walk-reminder gọi, bằng service role.
create or replace function public.walk_reminders(p_date date)
returns table (user_id uuid, goal_km numeric, walked_km numeric)
language sql stable security definer
set search_path = public
as $$
  select pr.id, pr.goal_km, round(coalesce(sum(t.distance_m), 0)::numeric / 1000, 1)
  from public.profiles pr
  left join public.tracks t
    on t.user_id = pr.id and (t.started_at at time zone 'Asia/Ho_Chi_Minh')::date = p_date
  where pr.walk_reminder and pr.goal_km is not null
    and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id)
  group by pr.id, pr.goal_km
  having coalesce(sum(t.distance_m), 0) / 1000 < pr.goal_km;
$$;

revoke all on function public.walk_reminders(date) from public, anon, authenticated;
grant execute on function public.walk_reminders(date) to service_role;

commit;
