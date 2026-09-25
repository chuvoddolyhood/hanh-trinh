// Chuỗi ngày liên tiếp đi bộ đạt mục tiêu, tính ở máy (ngày theo giờ máy, lộ trình tính vào ngày bắt đầu).
import { toDateStr } from './dates';

const prevDay = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
};

// → số ngày liên tiếp tới hôm nay có tổng quãng đường ≥ goalKm. Hôm nay chưa đạt thì tính tới hôm qua (chuỗi chưa đứt).
export function walkStreak(tracks, goalKm, today = toDateStr(new Date())) {
  const perDay = new Map();
  for (const t of tracks) {
    if (!t.started_at) continue;
    const day = toDateStr(new Date(t.started_at));
    perDay.set(day, (perDay.get(day) ?? 0) + (t.distance_m || 0));
  }
  const met = (day) => (perDay.get(day) ?? 0) >= goalKm * 1000;
  let day = met(today) ? today : prevDay(today);
  let count = 0;
  while (met(day)) {
    count += 1;
    day = prevDay(day);
  }
  return count;
}
