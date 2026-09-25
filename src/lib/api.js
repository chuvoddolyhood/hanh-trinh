import { supabase, PHOTO_BUCKET } from './supabase';
import { compressPhoto } from './photo';
import { trackDistance } from './geo';

// Ném lỗi Supabase thành Error chuẩn để UI hiển thị
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------- Địa điểm -------------------------------

export async function listPlaces() {
  return unwrap(
    await supabase
      .from('places')
      .select('id, kind, name, lat, lng, visited_at, note, mood, weather, tags, created_at, photos(id, storage_path, taken_at)')
      .order('visited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  );
}

// Nén và upload ảnh vào thư mục của địa điểm, rồi ghi bảng photos
// photos: [{ file, gps, takenAt }]; onProgress(i, total) để hiển thị tiến độ upload
async function uploadPhotos(userId, placeId, photos, onProgress) {
  const rows = [];
  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i + 1, photos.length);
    const p = photos[i];
    const blob = await compressPhoto(p.file);
    // Thư mục đầu tiên phải là userId để khớp policy Storage
    const path = `${userId}/${placeId}/${crypto.randomUUID()}.jpg`;
    unwrap(
      await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      }),
    );
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

export async function createPlace({ userId, photos = [], ...fields }, onProgress) {
  const place = unwrap(await supabase.from('places').insert(fields).select().single());
  await uploadPhotos(userId, place.id, photos, onProgress);
  return place;
}

// Sửa check-in: cập nhật thông tin, xoá ảnh bị bỏ (removed: bản ghi photos cũ), thêm ảnh mới
export async function updatePlace({ userId, id, photos = [], removed = [], ...fields }, onProgress) {
  const place = unwrap(await supabase.from('places').update(fields).eq('id', id).select().single());
  if (removed.length) {
    unwrap(await supabase.storage.from(PHOTO_BUCKET).remove(removed.map((p) => p.storage_path)));
    unwrap(await supabase.from('photos').delete().in('id', removed.map((p) => p.id)));
  }
  await uploadPhotos(userId, id, photos, onProgress);
  return place;
}

export async function deletePlace(place) {
  const paths = (place.photos ?? []).map((p) => p.storage_path);
  // Xoá file trước; bản ghi photos tự xoá theo ON DELETE CASCADE
  if (paths.length) unwrap(await supabase.storage.from(PHOTO_BUCKET).remove(paths));
  unwrap(await supabase.from('places').delete().eq('id', place.id));
}

// Bucket riêng tư → cần signed URL (hết hạn sau 1 giờ). Trả về { [path]: url }
export async function getPhotoUrls(paths) {
  const data = unwrap(await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600));
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

// ------------------------------- Lộ trình -------------------------------

export async function listTracks() {
  return unwrap(
    await supabase
      .from('tracks')
      .select('id, name, source, started_at, ended_at, distance_m, points, created_at')
      .order('started_at', { ascending: false, nullsFirst: false }),
  );
}

// points: [[lng, lat, epochMs|null], ...]
export async function createTrack({ name, points, source }) {
  const times = points.map((p) => p[2]).filter((t) => t != null);
  return unwrap(
    await supabase
      .from('tracks')
      .insert({
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

export async function listTrips() {
  return unwrap(
    await supabase
      .from('trips')
      .select('id, name, start_date, end_date, tz, note, visibility, share_token')
      .order('start_date', { ascending: false }),
  );
}

// Múi giờ của máy: server dùng để xếp lộ trình vào đúng ngày khi chia sẻ
export async function createTrip(fields) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return unwrap(await supabase.from('trips').insert({ tz, ...fields }).select().single());
}

export async function updateTrip(id, fields) {
  return unwrap(await supabase.from('trips').update(fields).eq('id', id).select().single());
}

export async function deleteTrip(id) {
  unwrap(await supabase.from('trips').delete().eq('id', id));
}

// Dữ liệu chuyến được chia sẻ (không cần đăng nhập); null nếu link sai hoặc đã tắt
export async function getSharedTrip(token) {
  return unwrap(await supabase.rpc('shared_trip', { p_token: token }));
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
