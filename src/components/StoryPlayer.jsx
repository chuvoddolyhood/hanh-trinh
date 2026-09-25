import { useEffect, useState } from 'react';
import Icon from './icons';
import Polaroid from './Polaroid';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { formatDateLong } from '../lib/dates';
import { placeSummary } from './moods';

const SLIDE_MS = 5000;

/**
 * Xem lại chuyến đi dạng story: lần lượt từng nơi, bản đồ bay tới nơi đó (onFocus), thẻ dưới có ảnh và ghi chú.
 * Chạm nửa trái: lùi; nửa phải: tới. Phím ←/→, Esc. Tự chuyển sau 5 giây (tạm dừng được).
 * places: đã sắp theo thời gian; onFocus({lng, lat, zoom}) điều khiển bản đồ bên dưới.
 */
export default function StoryPlayer({ title, places, onFocus, onClose }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Mỗi nơi chỉ hiện 3 ảnh đầu
  const urls = usePhotoUrls(places.flatMap((p) => p.photos.slice(0, 3).map((ph) => ph.storage_path)), { thumb: true });
  const done = index >= places.length; // Màn kết thúc sau nơi cuối
  const place = places[index];

  // Bay tới nơi đang xem
  useEffect(() => {
    if (place) onFocus({ lng: place.lng, lat: place.lat, zoom: 14 });
    // onFocus đổi mỗi lần cha render; chỉ cần chạy khi đổi nơi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  // Tự chuyển nơi
  useEffect(() => {
    if (paused || done) return undefined;
    const id = setTimeout(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearTimeout(id);
  }, [index, paused, done]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, places.length));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [places.length, onClose]);

  return (
    <section className="story" aria-label={`Xem lại: ${title}`} aria-roledescription="story">
      <div className="story-bars" aria-hidden="true">
        {places.map((p, i) => (
          <span key={p.id} className="story-bar">
            <span
              className={`story-fill${i === index && !paused ? ' is-running' : ''}`}
              style={{ width: i < index ? '100%' : '0%', '--slide': `${SLIDE_MS}ms` }}
            />
          </span>
        ))}
      </div>

      <div className="story-top">
        <span className="story-title">{title}</span>
        {!done && (
          <button
            type="button"
            className="round-btn on-sky"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={18} />
          </button>
        )}
        <button type="button" className="round-btn on-sky" onClick={onClose} aria-label="Đóng">
          <Icon name="close" size={20} />
        </button>
      </div>

      {!done && (
        <>
          <button
            type="button"
            className="story-tap story-prev"
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            aria-label="Nơi trước"
          />
          <button type="button" className="story-tap story-next" onClick={() => setIndex(index + 1)} aria-label="Nơi tiếp theo" />
        </>
      )}

      {place && (
        <article className="story-card" key={place.id} aria-live="polite">
          {place.photos.length > 0 && (
            <div className="story-photos">
              {place.photos.slice(0, 3).map((ph, i) => (
                <Polaroid key={ph.id} src={urls[ph.storage_path]} alt={`Ảnh tại ${place.name}`} tilt={[-4, 3, -2][i]} />
              ))}
            </div>
          )}
          <span className="mono-label">{formatDateLong(place.visited_at).toUpperCase()}</span>
          <h2 className="story-name">{place.name}</h2>
          <span className="muted-sm">{placeSummary(place)}</span>
          {place.note && <p className="note story-note">{place.note}</p>}
          <span className="mono-label">{index + 1}/{places.length}</span>
        </article>
      )}

      {done && (
        <article className="story-card story-end">
          <h2 className="story-name">{title}</h2>
          <span className="muted">{places.length} nơi đã đến</span>
          <div className="row">
            <button type="button" className="btn-pill btn-dark" onClick={() => setIndex(0)}>Xem lại</button>
            <button type="button" className="btn-pill btn-outline" onClick={onClose}>Đóng</button>
          </div>
        </article>
      )}
    </section>
  );
}
