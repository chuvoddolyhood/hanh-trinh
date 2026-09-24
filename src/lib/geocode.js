// Tìm địa điểm qua Nominatim (OpenStreetMap)
// Chính sách sử dụng: tối đa 1 request/giây, không dùng cho autocomplete theo từng phím gõ

const BASE = 'https://nominatim.openstreetmap.org';
let lastCallAt = 0;

// Đảm bảo khoảng cách tối thiểu 1 giây giữa các lần gọi
async function throttle() {
  const wait = lastCallAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// Lấy tên ngắn gọn từ kết quả Nominatim
const shortName = (r) => r.name || r.display_name?.split(',')[0]?.trim() || null;

// Tìm theo tên → [{ id, name, address, lat, lng }]
export async function searchPlaces(query, signal) {
  await throttle();
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '6',
    'accept-language': 'vi',
  });
  const res = await fetch(`${BASE}/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Tìm kiếm thất bại (mã ${res.status}). Thử lại sau vài giây.`);
  const data = await res.json();
  return data.map((r) => ({
    id: r.place_id,
    name: shortName(r),
    address: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

// Toạ độ → tên địa điểm gần nhất (dùng để gợi ý tên khi ghim trên bản đồ)
export async function reverseGeocode(lat, lng, signal) {
  await throttle();
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    zoom: '18',
    'accept-language': 'vi',
  });
  const res = await fetch(`${BASE}/reverse?${params}`, { signal });
  if (!res.ok) return null;
  return shortName(await res.json());
}
