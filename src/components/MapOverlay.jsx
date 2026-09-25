import Icon from "./icons";
import Polaroid from "./Polaroid";
import { usePhotoUrls } from "../hooks/usePhotoUrls";
import { formatDateLong } from "../lib/dates";
import { formatDistance } from "../lib/geo";
import { weatherWord } from "../lib/weather";
import { placeSummary } from "./moods";

// Các thành phần nổi trên màn hình Bản đồ: tìm kiếm, chip thời tiết/thống kê, nút Check-in, thẻ xem nhanh.
// friendName: đang xem bản đồ của bạn → thay tìm kiếm bằng thanh "Bản đồ của …", ẩn nút Check-in
// planName: đang xem kế hoạch chuyến đi → thay tìm kiếm bằng thanh "Kế hoạch: …"
export default function MapOverlay({
  query,
  onQueryChange,
  onSearch,
  weather,
  stats,
  scratchOn,
  onScratchToggle,
  heatOn,
  onHeatToggle,
  friendName,
  onCloseFriend,
  planName,
  onClosePlan,
  selected,
  onOpen,
  onCheckin,
}) {
  const cover = selected?.photos[0]?.storage_path;
  const urls = usePhotoUrls(cover ? [cover] : [], { thumb: true });

  let bar = null;
  if (friendName)
    bar = { icon: "users", text: `Bản đồ của ${friendName}`, onClose: onCloseFriend, close: "Quay về bản đồ của tôi" };
  else if (planName)
    bar = { icon: "flag", text: `Kế hoạch: ${planName}`, onClose: onClosePlan, close: "Ẩn kế hoạch" };

  return (
    <>
      {bar && (
        <div className="map-top">
          <div className="map-search friend-bar">
            <Icon name={bar.icon} size={20} />
            <span className="friend-bar-name">{bar.text}</span>
            <button
              type="button"
              className="round-btn plain"
              onClick={bar.onClose}
              aria-label={bar.close}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
      )}

      {!bar && (
      <div className="map-top">
        <form
          className="map-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
        >
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
              {Math.round(weather.temp)}°C{" "}
              {weatherWord(weather.code).toLowerCase()}
            </span>
          )}
          <span className="map-chip">
            {stats.visited} nơi, {formatDistance(stats.distance)}
          </span>
          <button
            type="button"
            className="map-chip map-chip-btn"
            aria-pressed={scratchOn}
            onClick={onScratchToggle}
          >
            Tỉnh đã đến
          </button>
          <button
            type="button"
            className="map-chip map-chip-btn"
            aria-pressed={heatOn}
            onClick={onHeatToggle}
          >
            Nơi đi nhiều
          </button>
        </div>
      </div>
      )}

      {!friendName && (
        <button
          type="button"
          className={`checkin-fab${selected ? " has-card" : ""}`}
          onClick={onCheckin}
        >
          <Icon name="plus" size={18} strokeWidth={2.2} />
          {"Check-in"}
        </button>
      )}

      {selected && (
        <button
          type="button"
          className="quick-card"
          onClick={() => onOpen(selected.id)}
        >
          <Polaroid src={urls[cover]} tilt={-4} className="polaroid-sm" />
          <span className="quick-card-text">
            <span className="mono-label">
              {selected.kind === "wishlist"
                ? "MUỐN ĐẾN"
                : formatDateLong(selected.visited_at).toUpperCase()}
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
