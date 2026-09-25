// Xác định tỉnh, quốc gia của một điểm bằng ranh giới tĩnh trong public/geo (tạo bởi scripts/build-geo.py).
// Toạ độ theo GeoJSON: [lng, lat]; geometry luôn là MultiPolygon.

export const PROVINCES_URL = "/geo/provinces.json";
const COUNTRIES_URL = "/geo/countries.json";

// Điểm ngoài mọi vùng (check-in ở bãi biển, đảo nhỏ bị đơn giản hoá) → lấy vùng gần nhất trong ngưỡng này
const NEAREST_MAX_KM = 20;
const KM_PER_DEG = 111.32;

const cache = {};
function load(url) {
  cache[url] ??= fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Không tải được ${url}`);
      return r.json();
    })
    .then((fc) =>
      fc.features.map((f) => ({ ...f, bbox: bboxOf(f.geometry.coordinates) })),
    )
    .catch((e) => {
      delete cache[url]; // Cho phép thử lại lần sau
      throw e;
    });
  return cache[url];
}

function bboxOf(polys) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

// Ray casting; lỗ (vòng thứ 2 trở đi) đảo ngược kết quả
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function contains(feature, x, y) {
  const [minX, minY, maxX, maxY] = feature.bbox;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  return feature.geometry.coordinates.some((poly) =>
    poly.reduce((acc, ring) => (inRing(ring, x, y) ? !acc : acc), false),
  );
}

// Khoảng cách (km) từ điểm tới biên gần nhất, chiếu phẳng quanh điểm (đủ chính xác trong vài chục km)
function edgeKm(feature, x, y) {
  const [minX, minY, maxX, maxY] = feature.bbox;
  const pad = NEAREST_MAX_KM / KM_PER_DEG;
  // Vĩ độ cao thì 1 độ kinh chỉ dài vài km → nới biên theo kinh độ tương ứng
  const padX = pad / Math.max(Math.cos((y * Math.PI) / 180), 0.05);
  if (x < minX - padX || x > maxX + padX || y < minY - pad || y > maxY + pad)
    return Infinity;
  const kx = Math.cos((y * Math.PI) / 180);
  let best = Infinity;
  for (const poly of feature.geometry.coordinates) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1][0] - x) * kx,
          ay = ring[i - 1][1] - y;
        const bx = (ring[i][0] - x) * kx,
          by = ring[i][1] - y;
        const dx = bx - ax,
          dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2
          ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
          : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < best) best = d;
      }
    }
  }
  return best * KM_PER_DEG;
}

export function findRegion(features, lng, lat) {
  return features.find((f) => contains(f, lng, lat)) ?? null;
}

export function nearestRegion(features, lng, lat) {
  let best = null;
  let bestKm = NEAREST_MAX_KM;
  for (const f of features) {
    const km = edgeKm(f, lng, lat);
    if (km <= bestKm) {
      bestKm = km;
      best = f;
    }
  }
  return best;
}

/**
 * Tỉnh và quốc gia của các nơi đã đến → { p63: Set, p34: Set, countries: Map<iso, tên> }.
 * Điểm nằm trong một tỉnh → Việt Nam; ngoài ra thử quốc gia; không vùng nào chứa → vùng gần nhất trong 20 km.
 * File quốc gia chỉ tải khi có điểm ngoài lãnh thổ Việt Nam.
 */
export async function visitedRegions(places) {
  const provinces = await load(PROVINCES_URL);
  const out = { p63: new Set(), p34: new Set(), countries: new Map() };
  const addProvince = (f) => {
    out.p63.add(f.properties.n63);
    out.p34.add(f.properties.n34);
    out.countries.set("VN", "Việt Nam");
  };

  const rest = [];
  for (const p of places) {
    if (p.kind !== "visited") continue;
    const f = findRegion(provinces, p.lng, p.lat);
    if (f) addProvince(f);
    else rest.push(p);
  }
  if (!rest.length) return out;

  const countries = await load(COUNTRIES_URL);
  for (const p of rest) {
    const c = findRegion(countries, p.lng, p.lat);
    if (c && c.properties.iso !== "VN") {
      out.countries.set(c.properties.iso, c.properties.name);
      continue;
    }
    // Gần bờ hoặc sát biên giới: so tỉnh gần nhất với nước gần nhất, lấy cái gần hơn
    const near = nearestRegion(
      [...provinces, ...countries.filter((x) => x.properties.iso !== "VN")],
      p.lng,
      p.lat,
    );
    if (near?.properties.n63) addProvince(near);
    else if (near) out.countries.set(near.properties.iso, near.properties.name);
  }
  return out;
}
