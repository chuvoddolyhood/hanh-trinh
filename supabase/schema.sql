-- =====================================================================
-- Hành trình — Schema giai đoạn 1 (nhật ký cá nhân)
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor
-- =====================================================================

-- PostGIS: dùng cho truy vấn không gian (scratch map, tìm điểm gần nhau...)
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Bảng địa điểm (check-in hoặc wishlist)
-- ---------------------------------------------------------------------
create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  kind        text not null default 'visited' check (kind in ('visited', 'wishlist')),
  name        text not null check (char_length(name) between 1 and 200),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  -- Cột không gian tự sinh từ lat/lng, client không cần gửi
  location    geography(Point, 4326)
              generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  visited_at  date,
  note        text,
  mood        text,
  weather     jsonb,                          -- {code, text, tmax, tmin} lấy từ Open-Meteo
  tags        text[] not null default '{}',
  visibility  text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  created_at  timestamptz not null default now()
);

create index if not exists places_user_date_idx on public.places (user_id, visited_at desc);
create index if not exists places_location_idx  on public.places using gist (location);
create index if not exists places_tags_idx      on public.places using gin (tags);

-- ---------------------------------------------------------------------
-- Bảng ảnh gắn với địa điểm
-- ---------------------------------------------------------------------
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  place_id      uuid not null references public.places on delete cascade,
  storage_path  text not null unique,         -- đường dẫn trong bucket "photos"
  taken_at      timestamptz,                  -- thời điểm chụp (EXIF)
  lat           double precision,             -- GPS gốc của ảnh (chỉ lưu trong DB, ảnh upload đã bị xoá EXIF)
  lng           double precision,
  created_at    timestamptz not null default now()
);

create index if not exists photos_place_idx on public.photos (place_id);

-- ---------------------------------------------------------------------
-- Bảng lộ trình đi bộ
-- points: mảng [[lng, lat, epochMs|null], ...] — gọn, đủ dùng cho MVP
-- ---------------------------------------------------------------------
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  source      text not null default 'live' check (source in ('live', 'gpx')),
  started_at  timestamptz,
  ended_at    timestamptz,
  distance_m  double precision not null default 0,
  points      jsonb not null,
  visibility  text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  created_at  timestamptz not null default now()
);

create index if not exists tracks_user_date_idx on public.tracks (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- Row Level Security: mỗi người chỉ thấy và sửa dữ liệu của chính mình
-- (select auth.uid()) được bọc trong select để Postgres cache kết quả mỗi truy vấn
-- ---------------------------------------------------------------------
alter table public.places enable row level security;
alter table public.photos enable row level security;
alter table public.tracks enable row level security;

drop policy if exists "places_owner" on public.places;
create policy "places_owner" on public.places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "tracks_owner" on public.tracks;
create policy "tracks_owner" on public.tracks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Ảnh: ngoài việc là chủ sở hữu, place_id cũng phải thuộc về mình
drop policy if exists "photos_owner" on public.photos;
create policy "photos_owner" on public.photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.places p
      where p.id = place_id and p.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- Storage: bucket riêng tư "photos", mỗi user chỉ ghi/đọc thư mục <user_id>/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_bucket_select" on storage.objects;
create policy "photos_bucket_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "photos_bucket_insert" on storage.objects;
create policy "photos_bucket_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "photos_bucket_delete" on storage.objects;
create policy "photos_bucket_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
