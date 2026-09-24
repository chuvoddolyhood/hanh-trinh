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

// photos: [{ file, gps, takenAt }]; onProgress(i, total) để hiển thị tiến độ upload
export async function createPlace({ userId, photos = [], ...fields }, onProgress) {
  const place = unwrap(await supabase.from('places').insert(fields).select().single());

  const rows = [];
  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i + 1, photos.length);
    const p = photos[i];
    const blob = await compressPhoto(p.file);
    // Thư mục đầu tiên phải là userId để khớp policy Storage
    const path = `${userId}/${place.id}/${crypto.randomUUID()}.jpg`;
    unwrap(
      await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      }),
    );
    rows.push({
      place_id: place.id,
      storage_path: path,
      taken_at: p.takenAt ? p.takenAt.toISOString() : null,
      lat: p.gps?.lat ?? null,
      lng: p.gps?.lng ?? null,
    });
  }

  if (rows.length) unwrap(await supabase.from('photos').insert(rows));
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
