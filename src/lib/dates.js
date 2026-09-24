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

// "YYYY-MM" → "Tháng 9, 2026"
export function formatMonth(monthKey) {
  const [y, m] = monthKey.split('-');
  return `Tháng ${Number(m)}, ${y}`;
}
