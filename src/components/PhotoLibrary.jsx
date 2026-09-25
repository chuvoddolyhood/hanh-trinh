import { useMemo, useState } from 'react';
import { usePhotoUrls } from '../hooks/usePhotoUrls';

const PAGE = 60; // Mỗi lần hiện thêm 60 ảnh: xin signed URL theo từng trang, không xin cả nghìn ảnh một lúc

// Thư viện ảnh trong Nhật ký: lưới ảnh nhỏ mới nhất trước, lọc theo năm; chạm ảnh để mở nơi đã chụp
export default function PhotoLibrary({ places, onSelect }) {
  const all = useMemo(
    () =>
      places
        .flatMap((place) => place.photos.map((photo) => ({ place, photo, at: photo.taken_at ?? place.visited_at ?? '' })))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [places],
  );
  const years = [...new Set(all.map((x) => x.at.slice(0, 4)).filter(Boolean))];
  const [year, setYear] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const shown = (year ? all.filter((x) => x.at.startsWith(year)) : all).slice(0, limit);
  const urls = usePhotoUrls(shown.map((x) => x.photo.storage_path), { thumb: true });
  const total = year ? all.filter((x) => x.at.startsWith(year)).length : all.length;

  if (!all.length) return <p className="empty">Chưa có ảnh nào. Thêm ảnh khi check-in để xem ở đây.</p>;

  return (
    <>
      {years.length > 1 && (
        <div className="chips">
          {['', ...years].map((y) => (
            <button
              type="button"
              key={y || 'all'}
              className="chip"
              aria-pressed={year === y}
              onClick={() => {
                setYear(y);
                setLimit(PAGE);
              }}
            >
              {y || 'Tất cả'}
            </button>
          ))}
        </div>
      )}
      <p className="help">{total} ảnh</p>
      <ul className="photo-grid">
        {shown.map(({ place, photo }) => (
          <li key={photo.id}>
            <button type="button" onClick={() => onSelect(place.id)} aria-label={`Ảnh tại ${place.name}`}>
              {urls[photo.storage_path] ? <img src={urls[photo.storage_path]} alt="" loading="lazy" /> : <span />}
            </button>
          </li>
        ))}
      </ul>
      {shown.length < total && (
        <button type="button" className="btn-pill btn-outline" onClick={() => setLimit(limit + PAGE)}>
          Xem thêm ảnh
        </button>
      )}
    </>
  );
}
