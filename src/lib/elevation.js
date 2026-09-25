// Độ cao lộ trình từ Open-Meteo Elevation API (Copernicus DEM GLO-90, ô lưới 90 m; miễn phí, phải ghi nguồn).
// Một request tối đa 100 toạ độ → lấy mẫu 100 điểm rải đều theo quãng đường.
import { haversine } from './geo';

const MAX_POINTS = 100;
const cache = new Map(); // id lộ trình → kết quả (điểm không đổi sau khi lưu)

// Điểm rải đều theo quãng đường → [[lng, lat, khoảng cách từ đầu (m)], ...]
export function sampleByDistance(points, n = MAX_POINTS) {
  const dist = [0];
  for (let i = 1; i < points.length; i++) dist.push(dist[i - 1] + haversine(points[i - 1], points[i]));
  const total = dist.at(-1);
  const count = Math.min(n, points.length);
  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? 0 : (total * k) / (count - 1);
    while (j < points.length - 1 && dist[j] < target) j++;
    out.push([points[j][0], points[j][1], dist[j]]);
  }
  return out;
}

// Tổng leo/xuống, thấp/cao nhất. Bỏ dao động dưới 2 m (sai số DEM) bằng cách chỉ cộng khi lệch đủ so với mốc trước.
export function elevationStats(elev, noiseM = 2) {
  let gain = 0;
  let loss = 0;
  let ref = elev[0];
  for (const e of elev) {
    if (e - ref >= noiseM) {
      gain += e - ref;
      ref = e;
    } else if (ref - e >= noiseM) {
      loss += ref - e;
      ref = e;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss), min: Math.min(...elev), max: Math.max(...elev) };
}

// track: { id, points } → { profile: [[m, độ cao]], gain, loss, min, max }
export async function trackElevation(track) {
  if (cache.has(track.id)) return cache.get(track.id);
  const samples = sampleByDistance(track.points);
  const url = new URL('https://api.open-meteo.com/v1/elevation');
  url.searchParams.set('latitude', samples.map((s) => s[1].toFixed(5)).join(','));
  url.searchParams.set('longitude', samples.map((s) => s[0].toFixed(5)).join(','));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo trả lỗi ${res.status}`);
  const { elevation } = await res.json();
  const result = {
    profile: samples.map((s, i) => [s[2], elevation[i]]),
    ...elevationStats(elevation),
  };
  cache.set(track.id, result);
  return result;
}
