import { supabase, PHOTO_BUCKET } from './supabase';
import { compressPhoto, compressThumb, thumbPath, toJpegIfHeic } from './photo';
import { trackDistance } from './geo';
import { fetchDailyWeather } from './weather';
import { todayStr } from './dates';

const PROFILE = 'id, username, display_name';
const PLACE =
  'id, user_id, kind, name, lat, lng, visited_at, note, mood, weather, tags, visibility, trip_id, created_at, photos(id, storage_path, taken_at)';
const TRACK = 'id, user_id, name, source, started_at, ended_at, distance_m, points, trip_id, created_at';
// Chuyến kèm chủ và thành viên (chuyến nhóm)
const TRIP = `id, user_id, name, start_date, end_date, tz, note, visibility, share_token,
  owner:profiles!trips_owner_profile_fkey(${PROFILE}),
  members:trip_members(profile:profiles(${PROFILE}))`;

// Ném lỗi Supabase thành Error chuẩn để UI hiển thị
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------- Địa điểm -------------------------------

// Địa điểm của một người: RLS cho phép thấy cả nơi bạn bè chia sẻ nên luôn lọc theo userId
export async function listPlaces(userId) {
  return unwrap(
    await supabase
      .from('places')
      .select(PLACE)
      .eq('user_id', userId)
      .order('visited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  );
}

// Nén và upload ảnh vào thư mục của địa điểm, rồi ghi bảng photos
// photos: [{ id, file, gps, takenAt }]; onProgress(i, total) để hiển thị tiến độ upload
// Tên file theo id ảnh: gửi lại (hàng chờ ngoại tuyến) thì bỏ qua ảnh đã ghi xong
// 409: file đã lên ở lần gửi trước nhưng chưa kịp ghi bảng photos → coi như xong
async function uploadJpeg(path, blob) {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  const duplicate = error && (String(error.statusCode) === '409' || error.status === 409 || error.code === 'Duplicate');
  if (error && !duplicate) throw new Error(error.message);
}

// Đường dẫn ảnh gốc kèm ảnh nhỏ, để xoá cả hai (ảnh cũ chưa có ảnh nhỏ: Storage bỏ qua file không tồn tại)
const withThumbs = (paths) => paths.flatMap((p) => [p, thumbPath(p)]);

async function uploadPhotos(userId, placeId, photos, onProgress) {
  if (!photos.length) return;
  const saved = new Set(
    unwrap(await supabase.from('photos').select('storage_path').eq('place_id', placeId)).map((r) => r.storage_path),
  );
  const rows = [];
  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i + 1, photos.length);
    const p = photos[i];
    // Thư mục đầu tiên phải là userId để khớp policy Storage
    const path = `${userId}/${placeId}/${p.id ?? crypto.randomUUID()}.jpg`;
    if (saved.has(path)) continue;
    // Ảnh gốc và ảnh nhỏ (thẻ, nhật ký dùng ảnh nhỏ cho nhanh). HEIC chưa chuyển (nhập hàng loạt) → chuyển ở đây
    const file = await toJpegIfHeic(p.file);
    await uploadJpeg(path, await compressPhoto(file));
    await uploadJpeg(thumbPath(path), await compressThumb(file));
    rows.push({
      place_id: placeId,
      storage_path: path,
      taken_at: p.takenAt ? p.takenAt.toISOString() : null,
      lat: p.gps?.lat ?? null,
      lng: p.gps?.lng ?? null,
    });
  }
  if (rows.length) unwrap(await supabase.from('photos').insert(rows));
}

// fields.id tạo sẵn ở máy: lần gửi trước đã tạo nơi (mất mạng lúc tải ảnh) thì chỉ tải nốt ảnh
export async function createPlace({ userId, photos = [], ...fields }, onProgress) {
  const place =
    unwrap(await supabase.from('places').select().eq('id', fields.id).maybeSingle()) ??
    unwrap(await supabase.from('places').insert(fields).select().single());
  await uploadPhotos(userId, place.id, photos, onProgress);
  return place;
}

// Sửa check-in: cập nhật thông tin, xoá ảnh bị bỏ (removed: bản ghi photos cũ), thêm ảnh mới
export async function updatePlace({ userId, id, photos = [], removed = [], ...fields }, onProgress) {
  const place = unwrap(await supabase.from('places').update(fields).eq('id', id).select().single());
  if (removed.length) {
    unwrap(await supabase.storage.from(PHOTO_BUCKET).remove(withThumbs(removed.map((p) => p.storage_path))));
    unwrap(await supabase.from('photos').delete().in('id', removed.map((p) => p.id)));
  }
  await uploadPhotos(userId, id, photos, onProgress);
  return place;
}

// Thêm ảnh vào địa điểm đã có (nhập ảnh hàng loạt trùng nơi cũ)
export const addPhotos = (userId, placeId, photos, onProgress) => uploadPhotos(userId, placeId, photos, onProgress);

export async function deletePlace(place) {
  const paths = (place.photos ?? []).map((p) => p.storage_path);
  // Xoá file trước; bản ghi photos tự xoá theo ON DELETE CASCADE
  if (paths.length) unwrap(await supabase.storage.from(PHOTO_BUCKET).remove(withThumbs(paths)));
  unwrap(await supabase.from('places').delete().eq('id', place.id));
}

// Bucket riêng tư → cần signed URL (hết hạn sau 1 giờ). Trả về { [path]: url }
export async function getPhotoUrls(paths) {
  const data = unwrap(await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600));
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

// ------------------------------- Lộ trình -------------------------------

export async function listTracks(userId) {
  return unwrap(
    await supabase
      .from('tracks')
      .select(TRACK)
      .eq('user_id', userId)
      .order('started_at', { ascending: false, nullsFirst: false }),
  );
}

// points: [[lng, lat, epochMs|null], ...]
// id (tuỳ chọn) tạo sẵn ở máy: gửi lại từ hàng chờ ngoại tuyến không tạo trùng
export async function createTrack({ id, name, points, source }) {
  if (id) {
    const existing = unwrap(await supabase.from('tracks').select(TRACK).eq('id', id).maybeSingle());
    if (existing) return existing;
  }
  const times = points.map((p) => p[2]).filter((t) => t != null);
  return unwrap(
    await supabase
      .from('tracks')
      .insert({
        id,
        name,
        source,
        points,
        distance_m: trackDistance(points),
        started_at: times.length ? new Date(times[0]).toISOString() : null,
        ended_at: times.length ? new Date(times[times.length - 1]).toISOString() : null,
      })
      .select()
      .single(),
  );
}

export async function deleteTrack(id) {
  unwrap(await supabase.from('tracks').delete().eq('id', id));
}

// ------------------------------- Chuyến đi -------------------------------

// Chuyến của mình và chuyến nhóm mình là thành viên (RLS)
export async function listTrips() {
  return unwrap(await supabase.from('trips').select(TRIP).order('start_date', { ascending: false }));
}

// Múi giờ của máy: server dùng để xếp lộ trình vào đúng ngày khi chia sẻ
export async function createTrip(fields) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return unwrap(await supabase.from('trips').insert({ tz, ...fields }).select(TRIP).single());
}

export async function updateTrip(id, fields) {
  return unwrap(await supabase.from('trips').update(fields).eq('id', id).select(TRIP).single());
}

export async function deleteTrip(id) {
  unwrap(await supabase.from('trips').delete().eq('id', id));
}

// Nơi, lộ trình mọi người trong chuyến đã chọn chia sẻ với nhóm
export async function listTripItems(tripId) {
  const [places, tracks] = await Promise.all([
    supabase.from('places').select(PLACE).eq('trip_id', tripId),
    supabase.from('tracks').select(TRACK).eq('trip_id', tripId),
  ]);
  return { places: unwrap(places), tracks: unwrap(tracks) };
}

// Gắn hoặc gỡ một nơi / lộ trình của mình khỏi chuyến nhóm (tripId null = gỡ)
export async function setItemTrip(table, id, tripId) {
  unwrap(await supabase.from(table).update({ trip_id: tripId }).eq('id', id));
}

export async function addTripMember(tripId, userId) {
  unwrap(await supabase.from('trip_members').insert({ trip_id: tripId, user_id: userId }));
}

// Chủ xoá thành viên, hoặc thành viên tự rời chuyến
export async function removeTripMember(tripId, userId) {
  unwrap(await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId));
}

// Dữ liệu chuyến được chia sẻ (không cần đăng nhập); null nếu link sai hoặc đã tắt
export async function getSharedTrip(token) {
  return unwrap(await supabase.rpc('shared_trip', { p_token: token }));
}

// Nơi muốn đến → đã đến hôm nay (check-in một chạm); giữ trip_id để vẫn thuộc chuyến.
// Thời tiết là thông tin phụ: lỗi mạng thì bỏ qua
export async function markVisited(place) {
  const today = todayStr();
  const weather = await fetchDailyWeather(place.lat, place.lng, today).catch(() => null);
  unwrap(await supabase.from('places').update({ kind: 'visited', visited_at: today, weather }).eq('id', place.id));
}

// --------------------------- Chi phí chuyến đi ---------------------------

const EXPENSE = 'id, trip_id, created_by, paid_by, title, amount, spent_on, split_among, created_at';

export async function listExpenses(tripId) {
  return unwrap(
    await supabase.from('trip_expenses').select(EXPENSE).eq('trip_id', tripId)
      .order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
  );
}

// fields: { trip_id, paid_by, title, amount, spent_on, split_among }
export async function addExpense(fields) {
  unwrap(await supabase.from('trip_expenses').insert(fields));
}

export async function updateExpense(id, fields) {
  unwrap(await supabase.from('trip_expenses').update(fields).eq('id', id));
}

export async function deleteExpense(id) {
  unwrap(await supabase.from('trip_expenses').delete().eq('id', id));
}

// Nghe thay đổi chi phí của chuyến (Realtime). DELETE không lọc được theo trip_id → nhận của mọi chuyến,
// nơi gọi chỉ việc tải lại. Trả về hàm huỷ.
export function subscribeExpenses(tripId, onChange) {
  const filter = `trip_id=eq.${tripId}`;
  const channel = supabase
    .channel(`expenses-${tripId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_expenses', filter }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trip_expenses', filter }, onChange)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'trip_expenses' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ----------------------------- Vùng riêng tư -----------------------------

export async function listZones() {
  return unwrap(await supabase.from('privacy_zones').select('id, name, lat, lng, radius_m').order('created_at'));
}

export async function createZone(fields) {
  return unwrap(await supabase.from('privacy_zones').insert(fields).select().single());
}

export async function deleteZone(id) {
  unwrap(await supabase.from('privacy_zones').delete().eq('id', id));
}

// ------------------------------- Hồ sơ, bạn bè -------------------------------

export async function getMyProfile(userId) {
  const [profile, invite] = await Promise.all([
    supabase.from('profiles').select(PROFILE).eq('id', userId).single(),
    supabase.from('invites').select('token').eq('user_id', userId).single(),
  ]);
  return { ...unwrap(profile), inviteToken: unwrap(invite).token };
}

export async function updateProfile(userId, fields) {
  const { data, error } = await supabase.from('profiles').update(fields).eq('id', userId).select(PROFILE).single();
  if (error?.code === '23505') throw new Error('Username này đã có người dùng.');
  if (error?.code === '23514') throw new Error('Username chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới; 3–30 ký tự.');
  return unwrap({ data, error });
}

// Cài đặt lưu trên hồ sơ: { leaderboard, walk_reminder, goal_km }
export async function getSettings(userId) {
  return unwrap(await supabase.from('profiles').select('leaderboard, walk_reminder, goal_km').eq('id', userId).single());
}

export async function updateSettings(userId, fields) {
  unwrap(await supabase.from('profiles').update(fields).eq('id', userId));
}

// Bảng xếp hạng: mình và bạn bè cùng tham gia (rỗng nếu mình chưa tham gia). year null = mọi năm
export async function getLeaderboard(year) {
  return unwrap(await supabase.rpc('friend_leaderboard', { p_year: year }));
}

// Đổi link mời: link cũ không dùng được nữa
export async function renewInvite(userId) {
  return unwrap(
    await supabase.from('invites').update({ token: crypto.randomUUID() }).eq('user_id', userId).select('token').single(),
  ).token;
}

export async function findProfile(username) {
  return unwrap(await supabase.rpc('find_profile', { p_username: username }))[0] ?? null;
}

// Trả về 'pending' (đã gửi lời mời) hoặc 'accepted' (người kia đã mời mình trước → thành bạn)
export async function requestFriend(userId) {
  return unwrap(await supabase.rpc('request_friend', { p_user: userId }));
}

// Trả về tên người mời
export async function acceptInvite(token) {
  return unwrap(await supabase.rpc('accept_invite', { p_token: token }));
}

// → [{ profile, status, incoming }]: incoming = lời mời người khác gửi cho mình
export async function listFriendships(userId) {
  const rows = unwrap(
    await supabase
      .from('friendships')
      .select(`requester, addressee, status, created_at,
        from:profiles!friendships_requester_fkey(${PROFILE}),
        to:profiles!friendships_addressee_fkey(${PROFILE})`)
      .order('created_at', { ascending: false }),
  );
  return rows.map((r) => ({
    profile: r.requester === userId ? r.to : r.from,
    status: r.status,
    incoming: r.addressee === userId,
  }));
}

export async function acceptFriend(requesterId, userId) {
  unwrap(
    await supabase.from('friendships').update({ status: 'accepted' })
      .eq('requester', requesterId).eq('addressee', userId),
  );
}

// Từ chối, huỷ lời mời hoặc huỷ kết bạn
export async function removeFriendship(a, b) {
  unwrap(
    await supabase.from('friendships').delete()
      .or(`and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`),
  );
}

// --------------------------- Bình luận, thả tim ---------------------------

export async function listComments(placeId) {
  return unwrap(
    await supabase
      .from('comments')
      .select(`id, body, created_at, user_id, author:profiles(${PROFILE})`)
      .eq('place_id', placeId)
      .order('created_at'),
  );
}

export async function addComment(placeId, body) {
  unwrap(await supabase.from('comments').insert({ place_id: placeId, body }));
}

export async function deleteComment(id) {
  unwrap(await supabase.from('comments').delete().eq('id', id));
}

// → danh sách user_id đã thả tim
export async function listReactions(placeId) {
  return unwrap(await supabase.from('reactions').select('user_id').eq('place_id', placeId)).map((r) => r.user_id);
}

export async function setReaction(placeId, userId, on) {
  if (on) unwrap(await supabase.from('reactions').upsert({ place_id: placeId, user_id: userId }));
  else unwrap(await supabase.from('reactions').delete().eq('place_id', placeId).eq('user_id', userId));
}

// Nghe bình luận, thả tim của một địa điểm (Supabase Realtime, tôn trọng RLS). Trả về hàm huỷ.
// Realtime không lọc được sự kiện DELETE và chỉ gửi khoá chính (payload.old) → onChange nhận cả DELETE
// của nơi khác; nơi gọi tự kiểm tra old.place_id (reactions) hoặc old.id (comments).
export function subscribePlace(placeId, onChange) {
  const filter = `place_id=eq.${placeId}`;
  const channel = supabase.channel(`place-${placeId}`);
  for (const table of ['comments', 'reactions']) {
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

// Nhập nhiều địa điểm một lúc (Google Timeline), chia lô để request không quá lớn
export async function createPlacesBulk(rows, onProgress) {
  for (let i = 0; i < rows.length; i += 200) {
    unwrap(await supabase.from('places').insert(rows.slice(i, i + 200)));
    onProgress?.(Math.min(i + 200, rows.length), rows.length);
  }
}

// ------------------------------- Web Push -------------------------------

// Lưu đăng ký push của trình duyệt này (endpoint là duy nhất; đăng ký lại thì cập nhật)
export async function savePushSubscription(sub) {
  const { endpoint, keys } = sub.toJSON();
  unwrap(
    await supabase
      .from('push_subscriptions')
      .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' }),
  );
}

export async function deletePushSubscription(endpoint) {
  unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint));
}
