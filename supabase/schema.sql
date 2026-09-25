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

-- Người xem link chia sẻ (kể cả chưa đăng nhập) được tạo signed URL cho ảnh của chuyến đó.
-- Ảnh nhỏ <uuid>_t.jpg quy về ảnh gốc <uuid>.jpg để kiểm tra (bảng photos chỉ ghi ảnh gốc).
drop policy if exists "photos_bucket_shared" on storage.objects;
create policy "photos_bucket_shared" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos' and private.is_shared_photo(regexp_replace(name, '_t\.jpg$', '.jpg')));

-- =====================================================================
-- Giai đoạn 2: hồ sơ, bạn bè, bình luận, thả tim
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hồ sơ: tên hiển thị và username (tuỳ chọn, dùng để tìm bạn)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text unique check (username ~ '^[a-z0-9_.]{3,30}$'),
  display_name  text not null check (char_length(display_name) between 1 and 60),
  created_at    timestamptz not null default now()
);

-- Link mời kết bạn: bảng riêng để người khác không đọc được token
create table if not exists public.invites (
  user_id  uuid primary key references public.profiles on delete cascade,
  token    uuid not null unique default gen_random_uuid()
);

-- Quan hệ bạn bè: requester gửi, addressee chấp nhận. Mỗi cặp chỉ có một dòng (theo cả hai chiều).
create table if not exists public.friendships (
  requester   uuid not null references public.profiles on delete cascade,
  addressee   uuid not null references public.profiles on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- Tạo hồ sơ và link mời khi có tài khoản mới; tên mặc định là phần trước @ của email
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Bạn mới'), 60))
  on conflict (id) do nothing;
  insert into public.invites (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Trigger chạy dưới quyền supabase_auth_admin (dịch vụ Auth) nên role này cần thấy schema private
grant usage on schema private to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Tài khoản đã có trước khi thêm bảng hồ sơ
insert into public.profiles (id, display_name)
select id, left(coalesce(nullif(split_part(email, '@', 1), ''), 'Bạn mới'), 60) from auth.users
on conflict (id) do nothing;
insert into public.invites (user_id) select id from public.profiles on conflict (user_id) do nothing;

-- a và b đã là bạn (đã chấp nhận)
create or replace function private.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- a và b có quan hệ nào đó (bạn bè hoặc lời mời đang chờ)
create or replace function private.are_connected(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where (f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)
  );
$$;

-- ---------------------------------------------------------------------
-- Địa điểm: thêm mức 'friends' (bạn bè xem được)
-- ---------------------------------------------------------------------
alter table public.places drop constraint if exists places_visibility_check;
alter table public.places add constraint places_visibility_check
  check (visibility in ('private', 'friends', 'unlisted', 'public'));

-- ---------------------------------------------------------------------
-- Bình luận và thả tim trên địa điểm (chỉ ai xem được địa điểm mới dùng được)
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references public.places on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists comments_place_idx on public.comments (place_id, created_at);

create table if not exists public.reactions (
  place_id    uuid not null references public.places on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (place_id, user_id)
);

-- ---------------------------------------------------------------------
-- RLS giai đoạn 2
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.friendships enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;

-- Hồ sơ: của mình, người có quan hệ, và người bình luận ở nơi mình xem được
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.are_connected(id, (select auth.uid()))
    or exists (select 1 from public.comments c where c.user_id = profiles.id)
  );

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "invites_owner" on public.invites;
create policy "invites_owner" on public.invites
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Lời mời được tạo qua RPC; người nhận chấp nhận bằng update, hai bên đều xoá được (từ chối, huỷ, huỷ kết bạn)
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

drop policy if exists "friendships_accept" on public.friendships;
create policy "friendships_accept" on public.friendships
  for update to authenticated
  using (addressee = (select auth.uid()))
  with check (addressee = (select auth.uid()) and status = 'accepted');

drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_delete" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- Bạn bè xem được nơi đặt mức 'friends', trừ nơi nằm trong vùng riêng tư của chủ
drop policy if exists "places_friends" on public.places;
create policy "places_friends" on public.places
  for select to authenticated
  using (
    visibility = 'friends'
    and private.are_friends(user_id, (select auth.uid()))
    and not private.in_privacy_zone(user_id, lng, lat)
  );

-- Ảnh của nơi mình xem được (RLS của places lọc sẵn trong truy vấn con)
drop policy if exists "photos_visible" on public.photos;
create policy "photos_visible" on public.photos
  for select to authenticated
  using (place_id in (select id from public.places));

-- Storage: tạo signed URL cho ảnh mình xem được qua bảng photos (ảnh nhỏ _t.jpg quy về ảnh gốc)
drop policy if exists "photos_bucket_friends" on storage.objects;
create policy "photos_bucket_friends" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.photos ph
      where ph.storage_path = regexp_replace(objects.name, '_t\.jpg$', '.jpg')
    )
  );

-- Bình luận, thả tim: xem và tạo trên nơi mình xem được; xoá của mình, hoặc chủ địa điểm xoá bình luận
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated
  using (place_id in (select id from public.places));

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and place_id in (select id from public.places));

drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or place_id in (select id from public.places where user_id = (select auth.uid()))
  );

drop policy if exists "reactions_select" on public.reactions;
create policy "reactions_select" on public.reactions
  for select to authenticated
  using (place_id in (select id from public.places));

drop policy if exists "reactions_insert" on public.reactions;
create policy "reactions_insert" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and place_id in (select id from public.places));

drop policy if exists "reactions_delete" on public.reactions;
create policy "reactions_delete" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- RPC kết bạn
-- ---------------------------------------------------------------------

-- Tìm đúng một người theo username (không liệt kê được danh sách người dùng)
create or replace function public.find_profile(p_username text)
returns table (id uuid, username text, display_name text)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name from public.profiles p
  where p.username = lower(trim(leading '@' from trim(p_username)));
$$;

-- Gửi lời mời; nếu người kia đã mời mình trước thì thành bạn luôn. Trả về trạng thái mới.
create or replace function public.request_friend(p_user uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_user = me then raise exception 'Không thể kết bạn với chính mình'; end if;
  update public.friendships set status = 'accepted'
    where requester = p_user and addressee = me and status = 'pending';
  if found then return 'accepted'; end if;
  insert into public.friendships (requester, addressee) values (me, p_user)
    on conflict do nothing;
  return (select status from public.friendships
          where least(requester, addressee) = least(me, p_user)
            and greatest(requester, addressee) = greatest(me, p_user));
end;
$$;

-- Nhận link mời: thành bạn ngay với chủ link. Trả về tên hiển thị của người mời.
create or replace function public.accept_invite(p_token uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inviter uuid;
begin
  select user_id into inviter from public.invites where token = p_token;
  if inviter is null then raise exception 'Link mời không tồn tại hoặc đã được đổi'; end if;
  if inviter = me then raise exception 'Đây là link mời của chính bạn'; end if;
  delete from public.friendships
    where least(requester, addressee) = least(me, inviter)
      and greatest(requester, addressee) = greatest(me, inviter);
  insert into public.friendships (requester, addressee, status) values (inviter, me, 'accepted');
  return (select display_name from public.profiles where id = inviter);
end;
$$;

revoke all on function public.find_profile(text) from public;
revoke all on function public.request_friend(uuid) from public;
revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.find_profile(text) to authenticated;
grant execute on function public.request_friend(uuid) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;

-- Realtime cho bình luận và thả tim (bỏ qua nếu bảng đã có trong publication)
do $$
declare t text;
begin
  foreach t in array array['comments', 'reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- Chuyến đi nhóm: chủ chuyến mời bạn bè; mỗi người tự chọn nơi, lộ trình
-- của mình để chia sẻ với nhóm (cột trip_id). Link chia sẻ công khai vẫn
-- chỉ gồm dữ liệu của chủ chuyến (shared_trip không đổi).
-- =====================================================================
create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips on delete cascade,
  user_id   uuid not null references public.profiles on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_idx on public.trip_members (user_id);

alter table public.places add column if not exists trip_id uuid references public.trips on delete set null;
alter table public.tracks add column if not exists trip_id uuid references public.trips on delete set null;
create index if not exists places_trip_idx on public.places (trip_id) where trip_id is not null;
create index if not exists tracks_trip_idx on public.tracks (trip_id) where trip_id is not null;

-- Để client lấy tên chủ chuyến bằng embed profiles (trips.user_id đã tham chiếu auth.users)
alter table public.trips drop constraint if exists trips_owner_profile_fkey;
alter table public.trips add constraint trips_owner_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- Người dùng là chủ hoặc thành viên của chuyến
create or replace function private.in_trip(p_trip uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.trips t where t.id = p_trip and t.user_id = p_user)
      or exists (select 1 from public.trip_members m where m.trip_id = p_trip and m.user_id = p_user);
$$;

-- a và b cùng ở một chuyến nhóm (để thấy tên nhau dù chưa là bạn)
create or replace function private.share_trip(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where (t.user_id = a or exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id = a))
      and (t.user_id = b or exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id = b))
      and exists (select 1 from public.trip_members m where m.trip_id = t.id)
  );
$$;

alter table public.trip_members enable row level security;

drop policy if exists "trips_member" on public.trips;
create policy "trips_member" on public.trips
  for select to authenticated
  using (private.in_trip(id, (select auth.uid())));

-- Thành viên: ai trong chuyến cũng xem được danh sách; chủ thêm (chỉ bạn bè) và xoá; thành viên tự rời được
drop policy if exists "trip_members_select" on public.trip_members;
create policy "trip_members_select" on public.trip_members
  for select to authenticated
  using (private.in_trip(trip_id, (select auth.uid())));

drop policy if exists "trip_members_insert" on public.trip_members;
create policy "trip_members_insert" on public.trip_members
  for insert to authenticated
  with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
    and private.are_friends((select auth.uid()), user_id)
  );

drop policy if exists "trip_members_delete" on public.trip_members;
create policy "trip_members_delete" on public.trip_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );

-- Nơi, lộ trình đã chọn cho chuyến: hiện với mọi người trong chuyến, khi tác giả vẫn còn trong chuyến
drop policy if exists "places_trip" on public.places;
create policy "places_trip" on public.places
  for select to authenticated
  using (
    trip_id is not null
    and private.in_trip(trip_id, (select auth.uid()))
    and private.in_trip(trip_id, user_id)
    and not private.in_privacy_zone(user_id, lng, lat)
  );

drop policy if exists "tracks_trip" on public.tracks;
create policy "tracks_trip" on public.tracks
  for select to authenticated
  using (
    trip_id is not null
    and private.in_trip(trip_id, (select auth.uid()))
    and private.in_trip(trip_id, user_id)
  );

-- Chỉ gắn vào chuyến mình đang ở (restrictive: cộng thêm vào policy chủ sở hữu)
drop policy if exists "places_trip_check_insert" on public.places;
create policy "places_trip_check_insert" on public.places
  as restrictive for insert to authenticated
  with check (trip_id is null or private.in_trip(trip_id, (select auth.uid())));

drop policy if exists "places_trip_check_update" on public.places;
create policy "places_trip_check_update" on public.places
  as restrictive for update to authenticated
  with check (trip_id is null or private.in_trip(trip_id, (select auth.uid())));

drop policy if exists "tracks_trip_check_insert" on public.tracks;
create policy "tracks_trip_check_insert" on public.tracks
  as restrictive for insert to authenticated
  with check (trip_id is null or private.in_trip(trip_id, (select auth.uid())));

drop policy if exists "tracks_trip_check_update" on public.tracks;
create policy "tracks_trip_check_update" on public.tracks
  as restrictive for update to authenticated
  with check (trip_id is null or private.in_trip(trip_id, (select auth.uid())));

-- Hồ sơ: thêm người cùng chuyến nhóm
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.are_connected(id, (select auth.uid()))
    or private.share_trip(id, (select auth.uid()))
    or exists (select 1 from public.comments c where c.user_id = profiles.id)
  );

-- Thành viên rời hoặc bị xoá khỏi chuyến → gỡ nơi, lộ trình của họ khỏi chuyến
-- (nếu không, lần sửa sau sẽ bị policy restrictive chặn vì trip_id trỏ tới chuyến họ không còn ở)
create or replace function private.detach_trip_items()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.places set trip_id = null where trip_id = old.trip_id and user_id = old.user_id;
  update public.tracks set trip_id = null where trip_id = old.trip_id and user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists on_trip_member_removed on public.trip_members;
create trigger on_trip_member_removed
  after delete on public.trip_members
  for each row execute function private.detach_trip_items();

-- =====================================================================
-- Giai đoạn 3: lộ trình nhập từ Google Timeline
-- =====================================================================
alter table public.tracks drop constraint if exists tracks_source_check;
alter table public.tracks add constraint tracks_source_check check (source in ('live', 'gpx', 'google'));

-- =====================================================================
-- Giai đoạn 3: nhắc "ngày này năm trước" bằng Web Push
-- Edge Function supabase/functions/memories gửi mỗi sáng (lịch pg_cron: xem README)
-- =====================================================================
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_owner" on public.push_subscriptions;
create policy "push_owner" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Nơi đã đến vào ngày p_month/p_day ở các năm trước năm p_year, gom theo người (chỉ Edge Function gọi, bằng service role)
create or replace function public.memories_on(p_year int, p_month int, p_day int)
returns table (user_id uuid, names text[], years int[])
language sql stable security definer
set search_path = public
as $$
  select p.user_id,
         array_agg(p.name order by p.visited_at desc),
         array_agg(distinct extract(year from p.visited_at)::int)
  from public.places p
  where p.kind = 'visited'
    and extract(month from p.visited_at) = p_month
    and extract(day from p.visited_at) = p_day
    and extract(year from p.visited_at) < p_year
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  group by p.user_id;
$$;

revoke all on function public.memories_on(int, int, int) from public, anon, authenticated;
grant execute on function public.memories_on(int, int, int) to service_role;
