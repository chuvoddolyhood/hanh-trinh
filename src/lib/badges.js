// Huy hiệu, cột mốc: tính ở máy từ dữ liệu đã tải, không lưu database.
// Tỉnh và miền theo bộ 34 tỉnh (tên n34 trong public/geo/provinces.json), không đổi theo lựa chọn 34/63 ở tab Tôi.

const MIEN = {
  bac: ['Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Ninh', 'Hưng Yên', 'Ninh Bình', 'Phú Thọ', 'Thái Nguyên',
    'Tuyên Quang', 'Lào Cai', 'Lạng Sơn', 'Cao Bằng', 'Lai Châu', 'Điện Biên', 'Sơn La'],
  trung: ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Trị', 'Huế', 'Đà Nẵng', 'Quảng Ngãi', 'Gia Lai', 'Khánh Hòa',
    'Đắk Lắk', 'Lâm Đồng'],
  nam: ['TP. Hồ Chí Minh', 'Đồng Nai', 'Tây Ninh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Cần Thơ', 'Cà Mau'],
};

// metric: số liệu so với goal; unit hiện sau số (km…)
const BADGES = [
  { id: 'places-1', metric: 'places', goal: 1, label: 'Dấu chân đầu tiên', desc: 'Check-in nơi đầu tiên' },
  { id: 'places-10', metric: 'places', goal: 10, label: 'Kẻ lang thang', desc: 'Đến 10 nơi' },
  { id: 'places-50', metric: 'places', goal: 50, label: 'Nhà thám hiểm', desc: 'Đến 50 nơi' },
  { id: 'places-100', metric: 'places', goal: 100, label: 'Trăm nơi', desc: 'Đến 100 nơi' },
  { id: 'prov-5', metric: 'provinces', goal: 5, label: 'Năm tỉnh', desc: 'Đến 5 tỉnh, thành' },
  { id: 'prov-17', metric: 'provinces', goal: 17, label: 'Nửa đất nước', desc: 'Đến 17 tỉnh, thành' },
  { id: 'prov-34', metric: 'provinces', goal: 34, label: 'Khắp Việt Nam', desc: 'Đến đủ 34 tỉnh, thành' },
  { id: 'mien-3', metric: 'mien', goal: 3, label: 'Ba miền', desc: 'Đến cả Bắc, Trung, Nam' },
  { id: 'km-10', metric: 'km', goal: 10, unit: 'km', label: 'Đôi chân chăm chỉ', desc: 'Đi bộ 10 km' },
  { id: 'km-100', metric: 'km', goal: 100, unit: 'km', label: 'Trăm cây số', desc: 'Đi bộ 100 km' },
  { id: 'km-500', metric: 'km', goal: 500, unit: 'km', label: 'Xuyên Việt', desc: 'Đi bộ 500 km' },
  { id: 'photos-100', metric: 'photos', goal: 100, label: 'Giữ khoảnh khắc', desc: 'Lưu 100 ảnh' },
  { id: 'countries-2', metric: 'countries', goal: 2, label: 'Xuất ngoại', desc: 'Đến 2 quốc gia' },
  { id: 'countries-5', metric: 'countries', goal: 5, label: 'Công dân toàn cầu', desc: 'Đến 5 quốc gia' },
];

/**
 * → [{ id, label, desc, value, goal, unit, done }], đã đạt trước.
 * regions: kết quả visitedRegions (null khi chưa tải xong → huy hiệu tỉnh, miền, quốc gia tính 0).
 */
export function badges(places, tracks, regions) {
  const visited = places.filter((p) => p.kind === 'visited');
  const p34 = regions?.p34 ?? new Set();
  const metrics = {
    places: visited.length,
    provinces: p34.size,
    mien: Object.values(MIEN).filter((names) => names.some((n) => p34.has(n))).length,
    km: Math.floor(tracks.reduce((s, t) => s + (t.distance_m || 0), 0) / 1000),
    photos: visited.reduce((s, p) => s + p.photos.length, 0),
    countries: regions?.countries.size ?? 0,
  };
  const list = BADGES.map((b) => {
    const value = Math.min(metrics[b.metric], b.goal);
    return { ...b, value, done: value >= b.goal };
  });
  return [...list.filter((b) => b.done), ...list.filter((b) => !b.done)];
}
