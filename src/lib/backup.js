// Sao lưu dữ liệu ra định dạng mở: địa điểm → GeoJSON, lộ trình → GPX 1.1 (mở được bằng OsmAnd, Strava, Google Earth…)
// Chưa gồm ảnh (bucket riêng tư, link ký chỉ sống 1 giờ); GeoJSON ghi số ảnh của mỗi nơi.

const escXml = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

export function placesToGeoJson(places) {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        name: p.name,
        kind: p.kind,
        visited_at: p.visited_at,
        note: p.note,
        mood: p.mood,
        weather: p.weather,
        tags: p.tags,
        visibility: p.visibility,
        photos: p.photos.length,
        created_at: p.created_at,
      },
    })),
  };
}

// points: [[lng, lat, epochMs|null], ...] → <trkpt>; điểm không có giờ thì bỏ thẻ <time>
export function tracksToGpx(tracks) {
  const trks = tracks.map((t) => {
    const pts = t.points
      .map(([lng, lat, ms]) =>
        `<trkpt lat="${lat}" lon="${lng}">${ms != null ? `<time>${new Date(ms).toISOString()}</time>` : ''}</trkpt>`,
      )
      .join('');
    return `<trk><name>${escXml(t.name)}</name><trkseg>${pts}</trkseg></trk>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Hanh trinh" xmlns="http://www.topografix.com/GPX/1/1">',
    ...trks,
    '</gpx>',
    '',
  ].join('\n');
}

// Tải chuỗi thành file (thẻ <a download>, chạy cả trên Safari iOS 13+)
export function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
