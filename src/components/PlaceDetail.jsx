import { useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';
import Polaroid from './Polaroid';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { formatDateLong, toDateStr } from '../lib/dates';
import { formatDistance } from '../lib/geo';
import { weatherKind, weatherWord } from '../lib/weather';
import { moodLabel } from './moods';
import PlaceSocial from './PlaceSocial';

const TILTS = [-4, 2, 5];

// Chi tiết một địa điểm: quả cầu aura theo thời tiết, chỉ số, ảnh polaroid, ghi chú, tag, bình luận.
// owner: tên chủ địa điểm khi xem nơi của bạn bè (chỉ xem, không sửa, xoá)
// place.pending: check-in lưu lúc mất mạng, chưa lên server (chỉ xem hoặc bỏ)
export default function PlaceDetail({ place, tracks, userId, owner = null, onBack, onDeleted, onChanged, onDiscardPending, onShowOnMap, onEdit, onTagClick }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const paths = place.photos.map((p) => p.storage_path);
  const thumbs = usePhotoUrls(paths, { thumb: true }); // Hiện trong khung polaroid
  const urls = usePhotoUrls(paths); // Ảnh gốc khi bấm mở

  // Nơi muốn đến → đã đến hôm nay, một chạm
  async function markVisited() {
    setDeleting(true);
    try {
      await api.markVisited(place);
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

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

  let audience = place.visibility === 'friends' ? 'BẠN BÈ XEM ĐƯỢC' : 'CHỈ MÌNH BẠN';
  if (owner) audience = `CỦA ${owner.toUpperCase()}`;
  const { pending } = place;

  const w = place.weather;
  const visited = place.kind === 'visited';
  // Quãng đường đi bộ trong ngày đến nơi này
  const walked = tracks
    .filter((t) => t.started_at && toDateStr(new Date(t.started_at)) === place.visited_at)
    .reduce((sum, t) => sum + (t.distance_m || 0), 0);

  return (
    <article className="screen detail">
      <div className="top-bar">
        <button type="button" className="round-btn" onClick={onBack} aria-label="Quay lại">
          <Icon name="back" size={20} strokeWidth={2} />
        </button>
        <button type="button" className="round-btn" onClick={onShowOnMap} aria-label="Xem trên bản đồ">
          <Icon name="map" size={20} />
        </button>
      </div>

      <div className="detail-sky">
        {w?.tmax != null && <div className="detail-temp">{Math.round(w.tmax)}<span>°C</span></div>}
        {w && <div className="detail-vword" aria-hidden="true">{weatherWord(w.code)}</div>}
        <div className={`orb orb-${weatherKind(w?.code)}`} aria-hidden="true" />
        <div className="horizon" aria-hidden="true" />
      </div>

      <div className="screen-inner detail-body">
        <header className="stack-xs">
          <h1 className="detail-name">{place.name}</h1>
          <span className="muted">{visited ? formatDateLong(place.visited_at) : 'Muốn đến'}</span>
          <span className="mono-label">
            {audience}
          </span>
        </header>

        {visited && (
          <dl className="stat-row stat-row-text">
            <div>
              <dt>THỜI TIẾT</dt>
              <dd>
                {w ? w.text : '—'}
                {w?.tmin != null && w?.tmax != null && `, ${Math.round(w.tmin)}–${Math.round(w.tmax)}°`}
              </dd>
            </div>
            <div><dt>CẢM XÚC</dt><dd>{moodLabel(place.mood) || '—'}</dd></div>
            <div><dt>ĐI BỘ</dt><dd>{walked ? formatDistance(walked) : '—'}</dd></div>
          </dl>
        )}

        {place.photos.length > 0 && (
          <div className="detail-photos">
            {place.photos.map((p, i) => (
              <a key={p.id} href={urls[p.storage_path]} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${i + 1}`}>
                <Polaroid src={thumbs[p.storage_path]} alt={`Ảnh tại ${place.name}`} tilt={TILTS[i % 3]} />
              </a>
            ))}
          </div>
        )}

        {place.note && <p className="note">{place.note}</p>}

        {place.tags.length > 0 && (
          <div className="tags">
            {place.tags.map((t) => (
              <button type="button" key={t} className="tag" onClick={() => onTagClick?.(t)} disabled={owner != null}>#{t}</button>
            ))}
          </div>
        )}

        {/* Chỉ có người khác xem được khi để mức Bạn bè hoặc đã chia sẻ vào chuyến nhóm */}
        {!pending && (place.visibility === 'friends' || place.trip_id) && <PlaceSocial placeId={place.id} userId={userId} isOwner={!owner} />}

        {error && <p className="error">{error}</p>}

        {pending && (
          <>
            <p className="notice" role="status">
              {pending.error
                ? `Chưa đồng bộ được: ${pending.error}`
                : `${pending.kind === 'edit' ? 'Thay đổi chưa đồng bộ' : 'Chưa đồng bộ'}: lưu trên máy lúc mất mạng, sẽ tự gửi khi có mạng${pending.photos ? ` (kèm ${pending.photos} ảnh mới)` : ''}.`}
            </p>
            {pending.kind === 'edit' && (
              <button type="button" className="btn-pill btn-outline" onClick={onEdit}>Sửa tiếp</button>
            )}
            <button
              type="button"
              className="btn-link danger"
              onClick={() =>
                window.confirm(
                  pending.kind === 'edit'
                    ? `Bỏ thay đổi chưa đồng bộ của "${place.name}"? Địa điểm giữ nguyên như trước khi sửa.`
                    : `Bỏ check-in "${place.name}" chưa đồng bộ? Không thể hoàn tác.`,
                ) && onDiscardPending()}
            >
              {pending.kind === 'edit' ? 'Bỏ thay đổi này' : 'Bỏ check-in này'}
            </button>
          </>
        )}

        {!owner && !pending && (
          <>
            {!visited && (
              <button type="button" className="btn-pill btn-dark" onClick={markVisited} disabled={deleting}>
                Đã đến hôm nay
              </button>
            )}
            <button type="button" className="btn-pill btn-outline" onClick={onEdit}>Sửa check-in, thêm ảnh</button>
            <button type="button" className="btn-link danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Đang xoá…' : 'Xoá địa điểm'}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
