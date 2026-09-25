import { useState } from 'react';
import * as api from '../lib/api';
import { parseTimeline, uniqueVisits } from '../lib/timeline';
import { reverseGeocode } from '../lib/geocode';
import { haversine } from '../lib/geo';
import { formatDate, toDateStr } from '../lib/dates';

const dayOf = (ms) => toDateStr(new Date(ms));
// Tự đặt tên bằng Nominatim chỉ khi ít nơi (1 request/giây)
const MAX_GEOCODE = 100;

// Tab Tôi: nhập nơi đã ghé và lộ trình đi bộ từ Google Timeline / Takeout
export default function TimelineImport({ places, onChanged }) {
  const [data, setData] = useState(null); // { visits, paths, min, max }
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [withPlaces, setWithPlaces] = useState(true);
  const [withPaths, setWithPaths] = useState(true);
  const [autoName, setAutoName] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function pick(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setMessage(null);
    try {
      const all = { visits: [], paths: [] };
      for (const f of files) {
        const r = parseTimeline(JSON.parse(await f.text()));
        all.visits.push(...r.visits.filter((v) => v.startMs != null));
        all.paths.push(...r.paths.filter((p) => p.startMs != null));
      }
      const times = [...all.visits, ...all.paths].map((x) => x.startMs);
      if (!times.length) throw new Error('File không có nơi đã ghé hay lộ trình đi bộ nào.');
      const min = dayOf(Math.min(...times));
      const max = dayOf(Math.max(...times));
      setData({ ...all, min, max });
      setFrom(min);
      setTo(max);
    } catch (err) {
      setData(null);
      setMessage(err instanceof SyntaxError ? 'File không phải JSON hợp lệ.' : err.message);
    }
  }

  const inRange = (ms) => {
    const d = dayOf(ms);
    return d >= from && d <= to;
  };
  // Bỏ nơi đã có check-in cùng ngày trong bán kính 100 m
  const isDuplicate = (v) =>
    places.some((p) => p.visited_at === dayOf(v.startMs) && haversine([p.lng, p.lat], [v.lng, v.lat]) < 100);
  const visits = data ? uniqueVisits(data.visits.filter((v) => inRange(v.startMs))).filter((v) => !isDuplicate(v)) : [];
  const paths = data ? data.paths.filter((p) => inRange(p.startMs)) : [];
  const unnamed = visits.filter((v) => !v.name).length;
  const canGeocode = unnamed > 0 && unnamed <= MAX_GEOCODE;

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      if (withPaths) {
        for (let i = 0; i < paths.length; i++) {
          setMessage(`Đang nhập lộ trình ${i + 1}/${paths.length}…`);
          const p = paths[i];
          await api.createTrack({ name: `Đi bộ ${formatDate(dayOf(p.startMs))}`, points: p.points, source: 'google' });
        }
      }
      if (withPlaces && visits.length) {
        const rows = [];
        for (let i = 0; i < visits.length; i++) {
          const v = visits[i];
          let name = v.name;
          if (!name && autoName && canGeocode) {
            setMessage(`Đang đặt tên nơi ${i + 1}/${visits.length}…`);
            name = await reverseGeocode(v.lat, v.lng).catch(() => null);
          }
          rows.push({
            kind: 'visited',
            name: (name || `Nơi đã ghé ${formatDate(dayOf(v.startMs))}`).slice(0, 200),
            lat: v.lat,
            lng: v.lng,
            visited_at: dayOf(v.startMs),
            tags: ['google'],
          });
        }
        await api.createPlacesBulk(rows, (n, total) => setMessage(`Đang lưu địa điểm ${n}/${total}…`));
      }
      setMessage(
        `Đã nhập ${withPlaces ? visits.length : 0} nơi và ${withPaths ? paths.length : 0} lộ trình. Nơi nhập có tag #google để dễ tìm, sửa tên.`,
      );
      setData(null);
      onChanged();
    } catch (err) {
      setMessage(`Nhập bị dừng giữa chừng: ${err.message}. Phần đã lưu vẫn còn.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack-sm">
      <h2 className="section-title">Nhập từ Google Timeline</h2>
      <p className="help">
        Trên điện thoại: Google Maps → Dòng thời gian → Xuất dữ liệu (file Timeline.json). Hoặc tải Google Takeout,
        mục Lịch sử vị trí (các file theo tháng). Nhà, chỗ làm được bỏ qua.
      </p>
      <label className={`btn-pill btn-outline file-btn${busy ? ' is-busy' : ''}`}>
        Chọn file JSON
        <input type="file" accept=".json,application/json" multiple onChange={pick} hidden disabled={busy} />
      </label>

      {data && (
        <div className="stack-sm import-preview">
          <div className="date-range">
            <label><span>Từ</span><input type="date" min={data.min} max={data.max} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label><span>Đến</span><input type="date" min={data.min} max={data.max} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <label className="check">
            <input type="checkbox" checked={withPlaces} onChange={(e) => setWithPlaces(e.target.checked)} />
            {`${visits.length} nơi đã ghé (bỏ nơi trùng, nơi đã check-in cùng ngày)`}
          </label>
          <label className="check">
            <input type="checkbox" checked={withPaths} onChange={(e) => setWithPaths(e.target.checked)} />
            {`${paths.length} lộ trình đi bộ, chạy`}
          </label>
          {withPlaces && unnamed > 0 && (
            <label className="check">
              <input type="checkbox" checked={autoName && canGeocode} disabled={!canGeocode} onChange={(e) => setAutoName(e.target.checked)} />
              {canGeocode
                ? `Tự đặt tên ${unnamed} nơi theo địa chỉ (khoảng ${unnamed} giây)`
                : `${unnamed} nơi chưa có tên: quá nhiều để tự đặt, hãy thu hẹp khoảng ngày`}
            </label>
          )}
          <button
            type="button"
            className="btn-pill btn-dark"
            onClick={run}
            disabled={busy || (!(withPlaces && visits.length) && !(withPaths && paths.length))}
          >
            {busy ? 'Đang nhập…' : 'Nhập'}
          </button>
        </div>
      )}
      {message && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
