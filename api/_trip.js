// Dùng chung cho các Vercel Function của link chia sẻ (file bắt đầu bằng _ không thành route).
// Biến môi trường giống bản build: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (khai báo trên Vercel).
import { formatDistance } from '../src/lib/geo.js';
import { formatDate } from '../src/lib/dates.js';

const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dữ liệu chuyến qua RPC shared_trip (đã lọc vùng riêng tư ở server); null nếu link sai hoặc đã tắt
export async function getSharedTrip(token) {
  if (!URL_ || !KEY || !UUID.test(token ?? '')) return null;
  const res = await fetch(`${URL_}/rest/v1/rpc/shared_trip`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_token: token }),
  });
  return res.ok ? res.json() : null;
}

// Signed URL ngắn hạn cho ảnh (policy Storage cho phép với ảnh của chuyến đang chia sẻ)
export async function signPhoto(path) {
  const res = await fetch(`${URL_}/storage/v1/object/sign/photos/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return signedURL ? `${URL_}/storage/v1${signedURL}` : null;
}

// Tóm tắt dùng cho thẻ meta và ảnh bìa
export function summarize({ trip, places, tracks }) {
  const range = trip.start_date === trip.end_date
    ? formatDate(trip.start_date)
    : `${formatDate(trip.start_date)} – ${formatDate(trip.end_date)}`;
  const km = tracks.reduce((s, t) => s + (t.distance_m || 0), 0);
  const days = Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 864e5) + 1;
  return {
    name: trip.name,
    range,
    stats: [`${places.length} nơi`, km > 0 && formatDistance(km), `${days} ngày`].filter(Boolean),
    cover: places.find((p) => p.photos.length)?.photos[0].storage_path ?? null,
  };
}
