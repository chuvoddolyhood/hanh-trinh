// Tổng kết năm, tính ở máy từ dữ liệu đã tải. Năm của nơi theo visited_at, của lộ trình theo giờ máy lúc bắt đầu.

const trackYear = (t) => (t.started_at ? new Date(t.started_at).getFullYear() : null);

// Các năm có nơi đã đến hoặc lộ trình, mới nhất trước
export function recapYears(places, tracks) {
  const years = new Set();
  for (const p of places) if (p.kind === 'visited' && p.visited_at) years.add(Number(p.visited_at.slice(0, 4)));
  for (const t of tracks) if (trackYear(t)) years.add(trackYear(t));
  return [...years].sort((a, b) => b - a);
}

// Giá trị xuất hiện nhiều nhất → [giá trị, số lần] hoặc null
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best;
}

const PICKS = 6;

export function yearRecap(places, tracks, year) {
  const visited = places
    .filter((p) => p.kind === 'visited' && p.visited_at?.startsWith(`${year}-`))
    .sort((a, b) => a.visited_at.localeCompare(b.visited_at) || a.created_at.localeCompare(b.created_at));
  const yearTracks = tracks.filter((t) => trackYear(t) === year);

  const months = Array(12).fill(0);
  for (const p of visited) months[Number(p.visited_at.slice(5, 7)) - 1] += 1;
  const peak = Math.max(...months);

  // Ảnh tiêu biểu: mỗi nơi một ảnh, rải đều theo thời gian trong năm
  const withPhotos = visited.filter((p) => p.photos.length > 0);
  const step = withPhotos.length / Math.min(PICKS, withPhotos.length);
  const picks = Array.from({ length: Math.min(PICKS, withPhotos.length) }, (_, i) => {
    const place = withPhotos[Math.floor(i * step)];
    return { place, photo: place.photos[0] };
  });

  return {
    visited,
    // Nơi đã đến trước năm này: để tính tỉnh mới
    before: places.filter((p) => p.kind === 'visited' && p.visited_at && p.visited_at < `${year}-01-01`),
    tracks: yearTracks,
    distance: yearTracks.reduce((s, t) => s + (t.distance_m || 0), 0),
    longest: yearTracks.reduce((best, t) => (!best || t.distance_m > best.distance_m ? t : best), null),
    photos: visited.reduce((s, p) => s + p.photos.length, 0),
    picks,
    months,
    topMonth: peak > 0 ? months.indexOf(peak) : null, // 0 = tháng 1
    topTag: mostCommon(visited.flatMap((p) => p.tags)),
    topMood: mostCommon(visited.map((p) => p.mood)),
    first: visited[0] ?? null,
    last: visited.at(-1) ?? null,
  };
}
