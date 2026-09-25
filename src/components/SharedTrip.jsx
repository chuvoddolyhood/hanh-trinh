import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import MapView from './MapView';
import Polaroid from './Polaroid';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { bounds, formatDistance } from '../lib/geo';
import { formatDate } from '../lib/dates';
import { placeSummary } from './moods';
import StoryPlayer from './StoryPlayer';
import Icon from './icons';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Trang xem chuyến đi qua link ?s=<token>, không cần đăng nhập.
// Dữ liệu đã được server lọc: chỉ nơi đã đến ngoài vùng riêng tư, lộ trình đã cắt, không có thời gian từng điểm.
export default function SharedTrip({ token, dark }) {
  const [data, setData] = useState(undefined); // undefined: đang tải; null: link sai hoặc đã tắt
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [storyOn, setStoryOn] = useState(false);

  useEffect(() => {
    if (!UUID.test(token)) {
      setData(null);
      return;
    }
    api.getSharedTrip(token).then(setData).catch(() => setData(null));
  }, [token]);

  // Mỗi đoạn lộ trình sau khi cắt là một đường riêng trên bản đồ
  const lines = useMemo(
    () => (data?.tracks ?? []).flatMap((t) => t.segments.map((points, i) => ({ id: `${t.id}-${i}`, points }))),
    [data],
  );
  const places = useMemo(() => (data?.places ?? []).map((p) => ({ ...p, kind: 'visited' })), [data]);
  const urls = usePhotoUrls(places.flatMap((p) => p.photos.map((ph) => ph.storage_path)));

  const padding = { bottom: window.innerHeight * 0.5 };
  useEffect(() => {
    const pts = [...places.map((p) => [p.lng, p.lat]), ...lines.flatMap((l) => l.points)];
    if (pts.length) setFocus({ bounds: bounds(pts), padding });
    // padding chỉ phụ thuộc kích thước cửa sổ lúc tải
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, lines]);

  useEffect(() => {
    if (data?.trip) document.title = `${data.trip.name} · Hành trình`;
  }, [data]);

  function pick(p) {
    setSelectedId(p.id);
    setFocus({ lng: p.lng, lat: p.lat, zoom: 15, padding });
  }

  if (data === undefined) return <div className="splash">Đang tải…</div>;
  if (data === null) {
    return (
      <div className="auth">
        <div className="auth-card stack">
          <h1 className="brand">Hành trình</h1>
          <p>Link không tồn tại hoặc chủ chuyến đi đã tắt chia sẻ.</p>
          <a className="btn-pill btn-dark" href="/">Mở Hành trình</a>
        </div>
      </div>
    );
  }

  const { trip } = data;
  const km = data.tracks.reduce((s, t) => s + (t.distance_m || 0), 0);
  const range = trip.start_date === trip.end_date
    ? formatDate(trip.start_date)
    : `${formatDate(trip.start_date)} – ${formatDate(trip.end_date)}`;

  return (
    <div className="app">
      <MapView
        key={dark ? 'dark' : 'light'}
        dark={dark}
        places={places}
        tracks={lines}
        livePoints={[]}
        selectedId={selectedId}
        focus={focus}
        onSelectPlace={(id) => pick(places.find((p) => p.id === id))}
        onMapClick={() => setSelectedId(null)}
      />
      {storyOn && (
        <StoryPlayer
          title={trip.name}
          places={places}
          onFocus={(f) => setFocus({ ...f, padding: { bottom: window.innerHeight * 0.48 } })}
          onClose={() => setStoryOn(false)}
        />
      )}
      {!storyOn && (
      <section className="sheet shared-sheet" aria-label="Chuyến đi">
        <header className="screen-head shared-head">
          <span className="mono-label wide">{range}</span>
          <h1 className="sheet-title">{trip.name}</h1>
          <span className="muted-sm">
            {places.length} nơi{km > 0 && `, ${formatDistance(km)} đi bộ`}
          </span>
        </header>
        {trip.note && <p className="note">{trip.note}</p>}
        {places.length > 0 && (
          <button type="button" className="btn-pill btn-dark shared-story" onClick={() => setStoryOn(true)}>
            <Icon name="play" size={16} />
            {'Xem dạng story'}
          </button>
        )}
        <ul className="shared-places">
          {places.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="shared-place" aria-current={selectedId === p.id || undefined} onClick={() => pick(p)}>
                <Polaroid src={urls[p.photos[0]?.storage_path]} tilt={i % 2 ? 3 : -3} className="polaroid-sm" />
                <span className="quick-card-text">
                  <span className="mono-label">{formatDate(p.visited_at)}</span>
                  <span className="quick-card-name">{p.name}</span>
                  <span className="muted-sm">{placeSummary(p)}</span>
                </span>
              </button>
              {selectedId === p.id && (p.note || p.photos.length > 1) && (
                <div className="shared-more">
                  {p.note && <p className="note">{p.note}</p>}
                  {p.photos.length > 1 && (
                    <div className="detail-photos">
                      {p.photos.slice(1).map((ph, j) => (
                        <a key={ph.id} href={urls[ph.storage_path]} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${j + 2}`}>
                          <Polaroid src={urls[ph.storage_path]} alt={`Ảnh tại ${p.name}`} tilt={j % 2 ? 2 : -2} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <a className="btn-link shared-cta" href="/">Tạo nhật ký hành trình của bạn</a>
      </section>
      )}
    </div>
  );
}
