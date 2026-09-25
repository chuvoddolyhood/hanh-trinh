// Nhập ảnh hàng loạt: gom ảnh thành các nơi đã đến theo vị trí và ngày chụp.
import { haversine } from './geo';
import { toDateStr } from './dates';

/**
 * photos: [{ id, gps: { lat, lng } | null, takenAt: Date }] → nhóm [{ id, date, lat, lng, photos }], sớm nhất trước.
 * Ảnh cùng ngày (giờ máy) và cách tâm nhóm tối đa radiusM thì chung một nơi. Ảnh không có vị trí bị bỏ qua.
 * ponytail: so với mọi nhóm cùng ngày, O(ảnh × nhóm); đủ cho vài nghìn ảnh
 */
export function groupPhotos(photos, radiusM = 300) {
  const groups = [];
  const located = photos.filter((p) => p.gps).sort((a, b) => a.takenAt - b.takenAt);
  for (const p of located) {
    const date = toDateStr(p.takenAt);
    const g = groups.find((x) => x.date === date && haversine([x.lng, x.lat], [p.gps.lng, p.gps.lat]) <= radiusM);
    if (g) {
      g.photos.push(p);
      // Tâm nhóm = trung bình các ảnh
      g.lat += (p.gps.lat - g.lat) / g.photos.length;
      g.lng += (p.gps.lng - g.lng) / g.photos.length;
    } else {
      groups.push({ id: p.id, date, lat: p.gps.lat, lng: p.gps.lng, photos: [p] });
    }
  }
  return groups;
}

// Nơi đã đến sẵn có cùng ngày, cách tâm nhóm tối đa radiusM → thêm ảnh vào nơi đó thay vì tạo nơi trùng
export function findExisting(group, places, radiusM = 200) {
  let best = null;
  let bestD = radiusM;
  for (const p of places) {
    if (p.kind !== 'visited' || p.visited_at !== group.date || p.pending) continue;
    const d = haversine([p.lng, p.lat], [group.lng, group.lat]);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
