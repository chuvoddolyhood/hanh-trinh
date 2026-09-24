// Các hàm tính toán địa lý thuần — không phụ thuộc thư viện ngoài
// Quy ước điểm: [lng, lat, epochMs | null]

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

// Khoảng cách Haversine giữa 2 điểm (mét)
export function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Tổng quãng đường của một lộ trình (mét)
export function trackDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

// Lọc nhiễu: bỏ điểm quá sát nhau và điểm "nhảy" với vận tốc phi lý
export function cleanTrack(points, { minStepM = 3, maxSpeedKmh = Infinity } = {}) {
  const out = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(p);
      continue;
    }
    const d = haversine(prev, p);
    if (d < minStepM) continue;
    if (prev[2] != null && p[2] != null) {
      const dtSec = (p[2] - prev[2]) / 1000;
      if (dtSec > 0 && (d / dtSec) * 3.6 > maxSpeedKmh) continue;
    }
    out.push(p);
  }
  return out;
}

// Khung bao [[minLng, minLat], [maxLng, maxLat]] để fitBounds trên bản đồ
export function bounds(points) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

// Định dạng khoảng cách cho người đọc
export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

// Định dạng thời lượng (ms) thành "1 giờ 05 phút" hoặc "12:34"
export function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
