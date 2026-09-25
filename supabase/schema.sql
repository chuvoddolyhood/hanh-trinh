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

-- =====================================================================
-- Chuyến đi, link chia sẻ, vùng riêng tư
-- =====================================================================

-- ---------------------------------------------------------------------
-- Chuyến đi: gom theo khoảng ngày. Địa điểm đã đến có visited_at trong khoảng
-- và lộ trình bắt đầu trong khoảng (tính theo múi giờ tz) thuộc về chuyến.
-- ---------------------------------------------------------------------
create table if not exists public.trips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  start_date   date not null,
  end_date     date not null,
  tz           text not null default 'Asia/Ho_Chi_Minh', -- múi giờ của máy khi tạo, dùng để xếp lộ trình vào ngày
  note         text,
  visibility   text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  share_token  uuid not null unique default gen_random_uuid(), -- đổi token = thu hồi link cũ
  created_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists trips_user_date_idx on public.trips (user_id, start_date desc);

-- ---------------------------------------------------------------------
-- Vùng riêng tư: địa điểm và đoạn lộ trình trong vùng bị ẩn khi chia sẻ
-- ---------------------------------------------------------------------
create table if not exists public.privacy_zones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    integer not null default 300 check (radius_m between 50 and 5000),
  created_at  timestamptz not null default now()
);

create index if not exists privacy_zones_user_idx on public.privacy_zones (user_id);

alter table public.trips enable row level security;
alter table public.privacy_zones enable row level security;

drop policy if exists "trips_owner" on public.trips;
create policy "trips_owner" on public.trips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "privacy_zones_owner" on public.privacy_zones;
create policy "privacy_zones_owner" on public.privacy_zones
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Hàm phụ trợ trong schema private (PostgREST không mở ra ngoài).
-- security definer để đọc được dữ liệu của chủ chuyến khi người xem chưa đăng nhập.
-- ---------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- Điểm (lng, lat) có nằm trong vùng riêng tư nào của owner không
-- Tham số có tiền tố p_ để không trùng tên cột lng, lat của privacy_zones
create or replace function private.in_privacy_zone(p_owner uuid, p_lng double precision, p_lat double precision)
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.privacy_zones z
    where z.user_id = p_owner
      and st_dwithin(
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        st_setsrid(st_makepoint(z.lng, z.lat), 4326)::geography,
        z.radius_m
      )
  );
$$;

-- Địa điểm được hiện khi chia sẻ chuyến: đã đến, trong khoảng ngày, ngoài vùng riêng tư
create or replace function private.trip_places(t public.trips)
returns setof public.places
language sql stable security definer
set search_path = public, extensions
as $$
  select p.* from public.places p
  where p.user_id = t.user_id
    and p.kind = 'visited'
    and p.visited_at between t.start_date and t.end_date
    and not private.in_privacy_zone(t.user_id, p.lng, p.lat);
$$;

-- Cắt lộ trình: bỏ điểm trong vùng riêng tư, tách thành các đoạn [[lng, lat], ...]; bỏ thời gian
-- ponytail: kiểm tra từng điểm một (N điểm × số vùng), đủ nhanh cho lộ trình đi bộ vài nghìn điểm
create or replace function private.clip_track(owner uuid, points jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  segs jsonb := '[]';
  cur  jsonb := '[]';
  pt   jsonb;
begin
  for pt in select value from jsonb_array_elements(points) loop
    if private.in_privacy_zone(owner, (pt->>0)::double precision, (pt->>1)::double precision) then
      if jsonb_array_length(cur) > 1 then segs := segs || jsonb_build_array(cur); end if;
      cur := '[]';
    else
      cur := cur || jsonb_build_array(jsonb_build_array(pt->0, pt->1));
    end if;
  end loop;
  if jsonb_array_length(cur) > 1 then segs := segs || jsonb_build_array(cur); end if;
  return segs;
end;
$$;

-- Ảnh thuộc một địa điểm đang được chia sẻ qua chuyến nào đó (dùng trong policy Storage)
create or replace function private.is_shared_photo(path text)
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.photos ph
    join public.trips t on t.user_id = ph.user_id and t.visibility <> 'private'
    where ph.storage_path = path
      and ph.place_id in (select id from private.trip_places(t))
  );
$$;

-- ---------------------------------------------------------------------
-- API công khai: dữ liệu chuyến đi theo token chia sẻ (null nếu link sai hoặc đã tắt)
-- Gọi từ client: supabase.rpc('shared_trip', { p_token })
-- ---------------------------------------------------------------------
create or replace function public.shared_trip(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'trip', jsonb_build_object('name', t.name, 'start_date', t.start_date, 'end_date', t.end_date, 'note', t.note),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'lat', p.lat, 'lng', p.lng, 'visited_at', p.visited_at,
        'note', p.note, 'mood', p.mood, 'weather', p.weather, 'tags', p.tags,
        'photos', coalesce((
          select jsonb_agg(jsonb_build_object('id', ph.id, 'storage_path', ph.storage_path) order by ph.taken_at)
          from public.photos ph where ph.place_id = p.id
        ), '[]')
      ) order by p.visited_at, p.created_at)
      from private.trip_places(t) p
    ), '[]'),
    'tracks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id, 'name', tr.name, 'distance_m', tr.distance_m, 'started_at', tr.started_at,
        'segments', private.clip_track(t.user_id, tr.points)
      ) order by tr.started_at)
      from public.tracks tr
      where tr.user_id = t.user_id
        and (tr.started_at at time zone t.tz)::date between t.start_date and t.end_date
    ), '[]')
  )
  from public.trips t
  where t.share_token = p_token and t.visibility <> 'private';
$$;

revoke all on function public.shared_trip(uuid) from public;
grant execute on function public.shared_trip(uuid) to anon, authenticated;

-- Người xem link chia sẻ (kể cả chưa đăng nhập) được tạo signed URL cho ảnh của chuyến đó
drop policy if exists "photos_bucket_shared" on storage.objects;
create policy "photos_bucket_shared" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos' and private.is_shared_photo(name));
