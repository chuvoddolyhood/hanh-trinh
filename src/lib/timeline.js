// Đọc file Google Timeline → { visits, paths }. Hỗ trợ 3 định dạng:
// 1. Google Takeout "Semantic Location History" (file theo tháng): { timelineObjects: [{ placeVisit } | { activitySegment }] }
// 2. Timeline trên Android, xuất từ máy (Timeline.json): { semanticSegments: [{ visit } | { activity } | { timelinePath }] }
// 3. Timeline trên iPhone, xuất từ máy: [{ visit } | { activity } | { timelinePath }] với toạ độ "geo:lat,lng"
//
// visits: [{ lat, lng, name, key, startMs }]; paths: [{ points: [[lng, lat, ms]], startMs }] (chỉ đi bộ, chạy)

// Nhà, chỗ làm: đi lại hằng ngày, không phải nơi "đã đến" (và là thông tin nhạy cảm)
const SKIP_SEMANTIC = /HOME|WORK/i;
const ON_FOOT = /WALK|FOOT|RUN|HIK/i;

const e7 = (v) => (typeof v === 'number' ? v / 1e7 : null);
const time = (v) => {
  if (v == null) return null;
  const ms = /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

// "10.7769°, 106.7009°" hoặc "geo:10.7769,106.7009" → { lat, lng }
function parseLatLng(s) {
  const m = String(s ?? '').match(/(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function fromTakeout(objects, out) {
  for (const o of objects) {
    const v = o.placeVisit;
    if (v) {
      const loc = v.location ?? {};
      const lat = e7(loc.latitudeE7);
      const lng = e7(loc.longitudeE7);
      if (lat == null || lng == null || SKIP_SEMANTIC.test(loc.semanticType ?? '')) continue;
      out.visits.push({
        lat,
        lng,
        name: loc.name ?? null,
        key: loc.placeId ?? null,
        startMs: time(v.duration?.startTimestamp ?? v.duration?.startTimestampMs),
      });
    }
    const a = o.activitySegment;
    if (a && ON_FOOT.test(a.activityType ?? '')) {
      const raw = a.simplifiedRawPath?.points ?? [];
      const points = raw
        .map((p) => [e7(p.lngE7), e7(p.latE7), time(p.timestamp ?? p.timestampMs)])
        .filter((p) => p[0] != null && p[1] != null);
      if (points.length >= 2) out.paths.push({ points, startMs: time(a.duration?.startTimestamp ?? a.duration?.startTimestampMs) });
    }
  }
}

// Định dạng xuất từ máy (Android và iPhone): điểm đường đi nằm trong các đoạn timelinePath riêng,
// ghép vào hoạt động đi bộ theo khoảng thời gian
function fromDevice(segments, out) {
  const pathPoints = [];
  for (const s of segments) {
    if (!s.timelinePath) continue;
    const start = time(s.startTime);
    for (const p of s.timelinePath) {
      const ll = parseLatLng(p.point);
      if (!ll) continue;
      const t = time(p.time) ?? (start != null ? start + Number(p.durationMinutesOffsetFromStartTime ?? 0) * 60000 : null);
      pathPoints.push([ll.lng, ll.lat, t]);
    }
  }
  pathPoints.sort((a, b) => (a[2] ?? 0) - (b[2] ?? 0));

  for (const s of segments) {
    const startMs = time(s.startTime);
    const v = s.visit;
    if (v) {
      const c = v.topCandidate ?? {};
      const ll = parseLatLng(c.placeLocation?.latLng ?? c.placeLocation);
      if (ll && !SKIP_SEMANTIC.test(c.semanticType ?? '')) {
        out.visits.push({ ...ll, name: null, key: c.placeId ?? c.placeID ?? null, startMs });
      }
    }
    const a = s.activity;
    if (a && ON_FOOT.test(a.topCandidate?.type ?? '')) {
      const endMs = time(s.endTime);
      const points = pathPoints.filter((p) => p[2] != null && p[2] >= startMs && p[2] <= endMs);
      if (points.length >= 2) out.paths.push({ points, startMs });
    }
  }
}

export function parseTimeline(json) {
  const out = { visits: [], paths: [] };
  if (Array.isArray(json?.timelineObjects)) fromTakeout(json.timelineObjects, out);
  else if (Array.isArray(json?.semanticSegments)) fromDevice(json.semanticSegments, out);
  else if (Array.isArray(json)) fromDevice(json, out);
  else throw new Error('Không nhận ra định dạng. Hãy chọn file JSON xuất từ Google Timeline hoặc Google Takeout.');
  return out;
}

// Gộp các lần ghé cùng một nơi (cùng placeId, hoặc cách nhau < ~100 m): giữ lần đầu, lấy tên nếu có
export function uniqueVisits(visits) {
  const byKey = new Map();
  for (const v of [...visits].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))) {
    const key = v.key ?? `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...v });
    else if (!prev.name && v.name) prev.name = v.name;
  }
  return [...byKey.values()];
}
