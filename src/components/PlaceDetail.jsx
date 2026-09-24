import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { formatDate } from '../lib/dates';
import { moodEmoji, moodLabel } from './moods';

// Chi tiết một địa điểm: ảnh, nhật ký, thời tiết, thao tác xoá
export default function PlaceDetail({ place, onBack, onDeleted, onFocus, onTagClick }) {
  const [urls, setUrls] = useState({});
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Lấy signed URL cho ảnh mỗi khi đổi địa điểm
  useEffect(() => {
    let alive = true;
    const paths = place.photos.map((p) => p.storage_path);
    setUrls({});
    if (paths.length) {
      api.getPhotoUrls(paths)
        .then((map) => alive && setUrls(map))
        .catch((e) => alive && setError(`Không tải được ảnh: ${e.message}`));
    }
    return () => { alive = false; };
  }, [place]);

  async function handleDelete() {
    if (!window.confirm(`Xoá "${place.name}" cùng toàn bộ ảnh? Không thể hoàn tác.`)) return;
    setDeleting(true);
    try {
      await api.deletePlace(place);
      onDeleted();
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  }

  const w = place.weather;

  return (
    <article className="detail stack">
      <button className="btn-link back" onClick={onBack}>‹ Nhật ký</button>

      <header>
        <h2 className="detail-title">{place.name}</h2>
        <p className="detail-meta">
          {place.kind === 'wishlist' ? 'Muốn đến' : formatDate(place.visited_at)}
          {place.mood && ` — ${moodEmoji(place.mood)} ${moodLabel(place.mood)}`}
        </p>
        {w && (
          <p className="weather">
            {w.text}
            {w.tmin != null && w.tmax != null && `, ${Math.round(w.tmin)}–${Math.round(w.tmax)}°C`}
          </p>
        )}
      </header>

      {place.photos.length > 0 && (
        <div className="photo-grid">
          {place.photos.map((p) =>
            urls[p.storage_path] ? (
              <a key={p.id} href={urls[p.storage_path]} target="_blank" rel="noreferrer">
                <img src={urls[p.storage_path]} alt={`Ảnh tại ${place.name}`} loading="lazy" />
              </a>
            ) : (
              <div key={p.id} className="photo-placeholder" aria-hidden="true" />
            ),
          )}
        </div>
      )}

      {place.note && <p className="note">{place.note}</p>}

      {place.tags.length > 0 && (
        <div className="tags">
          {place.tags.map((t) => (
            <button key={t} className="tag" onClick={() => onTagClick(t)}>#{t}</button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="row">
        <button className="btn" onClick={() => onFocus({ lng: place.lng, lat: place.lat, zoom: 16 })}>
          Xem trên bản đồ
        </button>
        <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Đang xoá…' : 'Xoá địa điểm'}
        </button>
      </div>
    </article>
  );
}
