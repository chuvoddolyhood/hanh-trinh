import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';
import { bounds, formatDistance } from '../lib/geo';
import { formatDate, todayStr } from '../lib/dates';

const VISIBILITY = [
  { id: 'private', label: 'Riêng tư' },
  { id: 'unlisted', label: 'Có link' },
  { id: 'public', label: 'Công khai' },
];

// Ngày YYYY-MM-DD của một thời điểm theo múi giờ của chuyến (khớp với hàm shared_trip trên server)
const dayIn = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });

// Chuyến đi gom theo khoảng ngày: nơi đã đến trong khoảng và lộ trình bắt đầu trong khoảng
export function tripItems(trip, places, tracks) {
  const inRange = (d) => d >= trip.start_date && d <= trip.end_date;
  return {
    places: places
      .filter((p) => p.kind === 'visited' && inRange(p.visited_at))
      .sort((a, b) => a.visited_at.localeCompare(b.visited_at)),
    tracks: tracks.filter((t) => t.started_at && inRange(dayIn(t.started_at, trip.tz))),
  };
}

const shareUrl = (trip) => `${window.location.origin}/?s=${trip.share_token}`;
const dateRange = (t) =>
  t.start_date === t.end_date ? formatDate(t.start_date) : `${formatDate(t.start_date)} – ${formatDate(t.end_date)}`;
const dayCount = (t) => Math.round((new Date(t.end_date) - new Date(t.start_date)) / 864e5) + 1;

// Tab Chuyến đi: danh sách, tạo/sửa chuyến, xem chi tiết và bật link chia sẻ
export default function TripsScreen({ places, tracks, onOpenPlace, onShowOnMap }) {
  const [trips, setTrips] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (tạo mới) | trip (sửa)

  async function load() {
    try {
      setTrips(await api.listTrips());
      setError(null);
    } catch (e) {
      setError(`Không tải được chuyến đi: ${e.message}`);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { load(); }, []);

  const open = trips.find((t) => t.id === openId);

  if (editing) {
    return (
      <TripForm
        trip={editing.id ? editing : null}
        onCancel={() => setEditing(null)}
        onSaved={async (t) => { await load(); setEditing(null); setOpenId(t.id); }}
        onDeleted={async () => { await load(); setEditing(null); setOpenId(null); }}
      />
    );
  }

  if (open) {
    return (
      <TripDetail
        trip={open}
        items={tripItems(open, places, tracks)}
        onBack={() => setOpenId(null)}
        onEdit={() => setEditing(open)}
        onChanged={(t) => setTrips((list) => list.map((x) => (x.id === t.id ? t : x)))}
        onOpenPlace={onOpenPlace}
        onShowOnMap={onShowOnMap}
      />
    );
  }

  return (
    <div className="screen">
      <div className="screen-inner stack">
        <header className="screen-head">
          <span className="mono-label wide">CHUYẾN ĐI CỦA TÔI</span>
          <h1 className="screen-title">Chuyến đi</h1>
          <span className="screen-sub">gom địa điểm và lộ trình theo ngày</span>
        </header>

        <button type="button" className="btn-pill btn-dark" onClick={() => setEditing({})}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          {'Tạo chuyến đi'}
        </button>

        {error && <p className="error">{error}</p>}
        {loaded && !error && trips.length === 0 && (
          <p className="empty">Chưa có chuyến đi nào. Tạo chuyến với khoảng ngày; các nơi đã đến và lộ trình trong khoảng đó tự vào chuyến.</p>
        )}

        <ul className="trip-list">
          {trips.map((t) => {
            const items = tripItems(t, places, tracks);
            const km = items.tracks.reduce((s, x) => s + (x.distance_m || 0), 0);
            return (
              <li key={t.id}>
                <button type="button" className="trip-card" onClick={() => setOpenId(t.id)}>
                  <span className="mono-label">{dateRange(t)}</span>
                  <span className="tl-name">{t.name}</span>
                  <span className="muted-sm">
                    {items.places.length} nơi{km > 0 && `, ${formatDistance(km)}`}
                    {t.visibility !== 'private' && ', đang chia sẻ'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TripDetail({ trip, items, onBack, onEdit, onChanged, onOpenPlace, onShowOnMap }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const km = items.tracks.reduce((s, x) => s + (x.distance_m || 0), 0);
  const allPoints = [...items.places.map((p) => [p.lng, p.lat]), ...items.tracks.flatMap((t) => t.points)];

  async function change(fields, done) {
    setBusy(true);
    setMessage(null);
    try {
      onChanged(await api.updateTrip(trip.id, fields));
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = shareUrl(trip);
    try {
      if (navigator.share) await navigator.share({ title: trip.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Đã sao chép link.');
      }
    } catch {
      // Người dùng huỷ bảng chia sẻ: không cần báo
    }
  }

  function renewLink() {
    if (!window.confirm('Tạo link mới? Link cũ sẽ không mở được nữa.')) return;
    change({ share_token: crypto.randomUUID() }, 'Đã tạo link mới.');
  }

  return (
    <div className="screen">
      <div className="screen-inner stack">
        <div className="row trip-actions">
          <button type="button" className="round-btn" onClick={onBack} aria-label="Quay lại danh sách chuyến đi">
            <Icon name="back" size={20} strokeWidth={2} />
          </button>
          {allPoints.length > 0 && (
            <button type="button" className="round-btn" onClick={() => onShowOnMap(bounds(allPoints))} aria-label="Xem chuyến trên bản đồ">
              <Icon name="map" size={20} />
            </button>
          )}
        </div>

        <header className="screen-head">
          <span className="mono-label wide">{dateRange(trip)}</span>
          <h1 className="screen-title trip-title">{trip.name}</h1>
        </header>

        <dl className="stat-row">
          <div><dt>NƠI ĐÃ ĐẾN</dt><dd>{items.places.length}</dd></div>
          <div><dt>ĐI BỘ</dt><dd>{km ? formatDistance(km).split(' ')[0] : '0'}<small> {km ? formatDistance(km).split(' ')[1] : 'km'}</small></dd></div>
          <div><dt>SỐ NGÀY</dt><dd>{dayCount(trip)}</dd></div>
        </dl>

        {trip.note && <p className="note">{trip.note}</p>}

        <section className="stack-sm">
          <h2 className="section-title">Chia sẻ</h2>
          <div className="chips" role="group" aria-label="Mức chia sẻ">
            {VISIBILITY.map((v) => (
              <button
                type="button"
                key={v.id}
                className="chip"
                aria-pressed={trip.visibility === v.id}
                disabled={busy}
                onClick={() => trip.visibility !== v.id && change({ visibility: v.id })}
              >
                {v.label}
              </button>
            ))}
          </div>
          {trip.visibility === 'private' ? (
            <p className="help">Chỉ bạn xem được chuyến này.</p>
          ) : (
            <>
              <p className="help">
                Ai có link cũng xem được địa điểm, ảnh và lộ trình trong chuyến mà không cần đăng nhập.
                Nơi và đoạn đường nằm trong vùng riêng tư (tab Tôi) được ẩn.
              </p>
              <input readOnly value={shareUrl(trip)} aria-label="Link chia sẻ" onFocus={(e) => e.target.select()} />
              <div className="row">
                <button type="button" className="btn-pill btn-dark" onClick={share}>Chia sẻ link</button>
                <button type="button" className="btn-pill btn-outline" onClick={renewLink} disabled={busy}>Tạo link mới</button>
              </div>
            </>
          )}
          {message && <p className="notice">{message}</p>}
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Địa điểm</h2>
          {items.places.length === 0 && <p className="empty">Chưa có nơi đã đến nào trong khoảng ngày này.</p>}
          <ul className="results">
            {items.places.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpenPlace(p.id)}>
                  <strong>{p.name}</strong>
                  <span>{formatDate(p.visited_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {items.tracks.length > 0 && (
          <section className="stack-sm">
            <h2 className="section-title">Lộ trình</h2>
            <ul className="track-list">
              {items.tracks.map((t) => (
                <li key={t.id}>
                  <button type="button" className="track-main" onClick={() => onShowOnMap(bounds(t.points))}>
                    <span className="track-name">{t.name}</span>
                    <span className="muted-sm">{formatDistance(t.distance_m)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button type="button" className="btn-pill btn-outline" onClick={onEdit}>Sửa chuyến đi</button>
      </div>
    </div>
  );
}

function TripForm({ trip, onCancel, onSaved, onDeleted }) {
  const [name, setName] = useState(trip?.name ?? '');
  const [start, setStart] = useState(trip?.start_date ?? todayStr());
  const [end, setEnd] = useState(trip?.end_date ?? todayStr());
  const [note, setNote] = useState(trip?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (end < start) {
      setError('Ngày về phải sau hoặc bằng ngày đi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = { name: name.trim(), start_date: start, end_date: end, note: note.trim() || null };
      onSaved(trip ? await api.updateTrip(trip.id, fields) : await api.createTrip(fields));
    } catch (err) {
      setError(`Chưa lưu được: ${err.message}`);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Xoá chuyến "${trip.name}"? Địa điểm và lộ trình vẫn được giữ.`)) return;
    setBusy(true);
    try {
      await api.deleteTrip(trip.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <form className="screen-inner stack" onSubmit={submit}>
        <div className="row trip-actions">
          <button type="button" className="round-btn" onClick={onCancel} aria-label="Huỷ">
            <Icon name="back" size={20} strokeWidth={2} />
          </button>
        </div>
        <h1 className="screen-title">{trip ? 'Sửa chuyến đi' : 'Chuyến đi mới'}</h1>

        <label className="field">
          <span>Tên chuyến</span>
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hội An mùa thu" />
        </label>
        <div className="date-range">
          <label><span>Ngày đi</span><input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label><span>Ngày về</span><input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <p className="help">Nơi đã đến và lộ trình trong khoảng ngày này tự thuộc về chuyến.</p>
        <label className="field">
          <span>Ghi chú</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu chuyến đi'}</button>
        {trip && (
          <button type="button" className="btn-link danger" onClick={remove} disabled={busy}>Xoá chuyến đi</button>
        )}
      </form>
    </div>
  );
}
