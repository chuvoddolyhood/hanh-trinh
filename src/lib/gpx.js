import { gpx } from '@tmcw/togeojson';
import { cleanTrack } from './geo';

// Đọc file GPX → danh sách lộ trình { name, points: [[lng, lat, epochMs|null], ...] }
export async function parseGpxFile(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error(`File "${file.name}" không phải GPX hợp lệ`);
  }

  const collection = gpx(doc);
  const results = [];

  collection.features.forEach((feature, index) => {
    const geom = feature.geometry;
    if (!geom) return;

    // togeojson: LineString → times là mảng; MultiLineString → times là mảng của mảng
    const times = feature.properties?.coordinateProperties?.times;
    let lines;
    let timeLines;
    if (geom.type === 'LineString') {
      lines = [geom.coordinates];
      timeLines = [times];
    } else if (geom.type === 'MultiLineString') {
      lines = geom.coordinates;
      timeLines = times;
    } else {
      return; // Bỏ qua waypoint (Point)
    }

    const raw = [];
    lines.forEach((line, i) => {
      line.forEach((coord, j) => {
        const t = timeLines?.[i]?.[j];
        const ms = t ? Date.parse(t) : NaN;
        raw.push([coord[0], coord[1], Number.isFinite(ms) ? ms : null]);
      });
    });

    // GPX có thể là đi xe/đạp nên chỉ lọc điểm trùng, không lọc theo vận tốc
    const points = cleanTrack(raw, { minStepM: 2 });
    if (points.length < 2) return;

    const baseName = file.name.replace(/\.gpx$/i, '');
    results.push({
      name: feature.properties?.name || (collection.features.length > 1 ? `${baseName} (${index + 1})` : baseName),
      points,
    });
  });

  return results;
}
