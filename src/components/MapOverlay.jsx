import Icon from './icons';
import Polaroid from './Polaroid';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { formatDateLong } from '../lib/dates';
import { formatDistance } from '../lib/geo';
import { weatherWord } from '../lib/weather';
import { placeSummary } from './moods';

// Các thành phần nổi trên màn hình Bản đồ: tìm kiếm, chip thời tiết/thống kê, nút Check-in, thẻ xem nhanh
export default function MapOverlay({ query, onQueryChange, onSearch, weather, stats, selected, onOpen, onCheckin }) {
  const cover = selected?.photos[0]?.storage_path;
  const urls = usePhotoUrls(cover ? [cover] : []);

  return (
    <>
      <div className="map-top">
        <form className="map-search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
          <Icon name="search" size={20} />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm nơi đã đến, #tag"
            aria-label="Tìm địa điểm trên bản đồ"
          />
        </form>
        <div className="map-chips">
          {weather && (
            <span className="map-chip">
              <Icon name="sun" size={14} strokeWidth={2} />
              {Math.round(weather.temp)}°C {weatherWord(weather.code).toLowerCase()}
            </span>
          )}
          <span className="map-chip">{stats.visited} nơi, {formatDistance(stats.distance)}</span>
        </div>
      </div>

      <button type="button" className={`checkin-fab${selected ? ' has-card' : ''}`} onClick={onCheckin}>
        <Icon name="plus" size={18} strokeWidth={2.2} />
        {'Check-in'}
      </button>

      {selected && (
        <button type="button" className="quick-card" onClick={() => onOpen(selected.id)}>
          <Polaroid src={urls[cover]} tilt={-4} className="polaroid-sm" />
          <span className="quick-card-text">
            <span className="mono-label">
              {selected.kind === 'wishlist' ? 'MUỐN ĐẾN' : formatDateLong(selected.visited_at).toUpperCase()}
            </span>
            <span className="quick-card-name">{selected.name}</span>
            <span className="muted-sm">{placeSummary(selected)}</span>
          </span>
          <Icon name="next" size={20} strokeWidth={2} />
        </button>
      )}
    </>
  );
}
