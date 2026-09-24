// Tiện ích ngày tháng theo múi giờ của thiết bị

const pad = (n) => String(n).padStart(2, '0');

// Date → "YYYY-MM-DD" theo giờ địa phương (không dùng toISOString vì lệch múi giờ)
export function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayStr = () => toDateStr(new Date());

// "YYYY-MM-DD" → "24/09/2026"
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// "YYYY-MM-DD" → "Thứ Tư, 12/08/2026"
export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${formatDate(dateStr)}`;
}

// Buổi trong ngày theo giờ: dùng cho nhãn "ĐI BỘ BUỔI CHIỀU"
export function partOfDay(date) {
  const h = date.getHours();
  if (h < 11) return 'buổi sáng';
  if (h < 14) return 'buổi trưa';
  if (h < 18) return 'buổi chiều';
  return 'buổi tối';
}

// Mùa theo tháng (tháng 1 → vị trí 0)
const SEASONS = ['đông', 'xuân', 'xuân', 'xuân', 'hè', 'hè', 'hè', 'thu', 'thu', 'thu', 'đông', 'đông'];

// "mùa hè 2026" theo tháng hiện tại
export function seasonLabel(date = new Date()) {
  return `mùa ${SEASONS[date.getMonth()]} ${date.getFullYear()}`;
}
