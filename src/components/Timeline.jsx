import { useMemo, useState } from "react";
import Icon from "./icons";
import Polaroid from "./Polaroid";
import { usePhotoUrls } from "../hooks/usePhotoUrls";
import { matchPlace } from "../lib/text";
import { seasonLabel, todayStr } from "../lib/dates";
import { formatDistance } from "../lib/geo";
import { placeSummary } from "./moods";

const KINDS = [
  { id: "all", label: "Tất cả" },
  { id: "visited", label: "Đã đến" },
  { id: "wishlist", label: "Muốn đến" },
];

// Màn hình Nhật ký: thống kê, bộ lọc, timeline nhóm theo tháng
// query được giữ ở App để bấm #tag trong trang chi tiết có thể lọc ngược về đây
export default function Timeline({
  places,
  tracks,
  provinceStats,
  onSelect,
  query,
  onQueryChange: setQuery,
}) {
  const [kind, setKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const visitedCount = useMemo(
    () => places.filter((p) => p.kind === "visited").length,
    [places],
  );
  const walked = formatDistance(
    tracks.reduce((sum, t) => sum + (t.distance_m || 0), 0),
  ).split(" ");

  const filtered = useMemo(
    () =>
      places.filter((p) => {
        if (kind !== "all" && p.kind !== kind) return false;
        // Lọc ngày: so sánh chuỗi YYYY-MM-DD là đủ chính xác
        if (from && (!p.visited_at || p.visited_at < from)) return false;
        if (to && (!p.visited_at || p.visited_at > to)) return false;
        return matchPlace(p, query);
      }),
    [places, query, kind, from, to],
  );

  // Nhóm theo tháng; địa điểm chưa có ngày (thường là wishlist) để cuối
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.visited_at ? p.visited_at.slice(0, 7) : "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()];
  }, [filtered]);

  // Theo mọi nơi (không theo kết quả lọc) để gõ tìm kiếm không phải xin lại URL ảnh
  const covers = places.map((p) => p.photos[0]?.storage_path).filter(Boolean);
  const urls = usePhotoUrls(covers);

  const showSearch = searchOpen || query || from || to;

  return (
    <div className="screen">
      <div className="orb orb-corner" aria-hidden="true" />
      <div className="screen-inner">
        <header className="screen-head">
          <span className="mono-label wide">NHẬT KÝ HÀNH TRÌNH</span>
          <h1 className="screen-title">Nhật ký</h1>
          <span className="screen-sub">{seasonLabel()}</span>
        </header>

        <dl className="stat-row">
          <div>
            <dt>NƠI ĐÃ ĐẾN</dt>
            <dd>{visitedCount}</dd>
          </div>
          <div>
            <dt>ĐÃ ĐI BỘ</dt>
            <dd>
              {walked[0]}
              <small> {walked[1]}</small>
            </dd>
          </div>
          <div>
            <dt>TỈNH, THÀNH</dt>
            <dd>
              {provinceStats ? provinceStats.count : "—"}
              <small> /{provinceStats?.total ?? 34}</small>
            </dd>
          </div>
        </dl>
        {provinceStats?.countries.length > 0 && (
          <p className="muted-sm countries">
            {provinceStats.countries.length} quốc gia:{" "}
            {provinceStats.countries.join(", ")}
          </p>
        )}

        <Memories places={places} onSelect={onSelect} />

        <div className="chips">
          {KINDS.map((k) => (
            <button
              type="button"
              key={k.id}
              className="chip"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
          <button
            type="button"
            className="chip chip-icon"
            aria-label="Tìm kiếm"
            aria-expanded={Boolean(showSearch)}
            onClick={() => setSearchOpen(!showSearch)}
          >
            <Icon name="search" size={16} strokeWidth={2} />
          </button>
        </div>

        {showSearch && (
          <div className="journal-search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên, ghi chú hoặc #tag"
              aria-label="Tìm trong nhật ký"
            />
            <div className="date-range">
              <label>
                <span>Từ</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                <span>Đến</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
            {(query || from || to) && (
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setQuery("");
                  setFrom("");
                  setTo("");
                }}
              >
                Xoá bộ lọc
              </button>
            )}
          </div>
        )}

        {places.length === 0 && (
          <p className="empty">
            Chưa có địa điểm nào. Mở Bản đồ, bấm Check-in rồi chạm lên bản đồ để
            ghim nơi đầu tiên.
          </p>
        )}
        {places.length > 0 && filtered.length === 0 && (
          <p className="empty">Không có địa điểm khớp bộ lọc.</p>
        )}

        {groups.map(([key, items]) => (
          <section key={key} className="month">
            <h2 className="month-title">
              {key === "none"
                ? "Chưa đặt ngày"
                : `Tháng ${Number(key.slice(5))}`}
              {key !== "none" && (
                <span className="mono-label">{key.slice(0, 4)}</span>
              )}
            </h2>
            <TimelineList items={items} urls={urls} onSelect={onSelect} />
          </section>
        ))}
      </div>
    </div>
  );
}

const ROW_H = { visited: 184, wishlist: 84 };

// Các mục xen kẽ trái/phải nối bằng đường cong S nét đứt; chấm cam = đã đến, vòng tím = muốn đến
function TimelineList({ items, urls, onSelect }) {
  // Vị trí chấm: phía có chữ của mỗi mục, x theo % chiều rộng, y theo px
  const dots = [];
  let top = 0;
  items.forEach((p, i) => {
    const textOnRight = i % 2 === 0;
    dots.push({
      x: textOnRight ? 72 : 28,
      y: top + (p.kind === "wishlist" ? 14 : 44),
      kind: p.kind,
    });
    top += ROW_H[p.kind];
  });

  let d = "M 50 0";
  let prev = { x: 50, y: 0 };
  for (const pt of [...dots, { x: 50, y: top }]) {
    const k = (pt.y - prev.y) * 0.6;
    d += ` C ${prev.x} ${prev.y + k}, ${pt.x} ${pt.y - k}, ${pt.x} ${pt.y}`;
    prev = pt;
  }

  return (
    <div className="timeline" style={{ height: top }}>
      <svg
        className="timeline-curve"
        viewBox={`0 0 100 ${top}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={d} vectorEffect="non-scaling-stroke" />
      </svg>
      {dots.map((pt, i) => (
        <span
          key={i}
          className={`timeline-dot dot-${pt.kind}`}
          style={{ left: `${pt.x}%`, top: pt.y }}
          aria-hidden="true"
        />
      ))}
      <ul className="timeline-items">
        {items.map((p, i) => (
          <li key={p.id} style={{ height: ROW_H[p.kind] }}>
            <button
              type="button"
              className={`tl-entry${i % 2 ? " is-flipped" : ""} tl-${p.kind}`}
              onClick={() => onSelect(p.id)}
            >
              {p.kind === "visited" && (
                <Polaroid
                  src={urls[p.photos[0]?.storage_path]}
                  caption={p.tags[0]}
                  tilt={i % 2 ? 3 : -3}
                />
              )}
              <span className="tl-text">
                <span className="mono-label">
                  {p.kind === "wishlist"
                    ? "MUỐN ĐẾN"
                    : (p.visited_at ?? "")
                        .slice(5)
                        .split("-")
                        .reverse()
                        .join("/")}
                  {p.pending && ", CHỜ ĐỒNG BỘ"}
                </span>
                <span className="tl-name">{p.name}</span>
                {p.kind === "visited" && (
                  <span className="muted-sm">{placeSummary(p)}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Những nơi đã đến vào đúng ngày này ở các năm trước
function Memories({ places, onSelect }) {
  const today = todayStr();
  const items = places
    .filter(
      (p) =>
        p.kind === "visited" &&
        p.visited_at?.slice(5) === today.slice(5) &&
        p.visited_at < today.slice(0, 4),
    )
    .sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  if (!items.length) return null;
  const thisYear = Number(today.slice(0, 4));
  return (
    <section className="memories" aria-label="Ngày này năm trước">
      <span className="mono-label wide">NGÀY NÀY NĂM TRƯỚC</span>
      <ul className="results">
        {items.map((p) => {
          const years = thisYear - Number(p.visited_at.slice(0, 4));
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p.id)}>
                <strong>{p.name}</strong>
                <span>{years === 1 ? "1 năm trước" : `${years} năm trước`}, {p.visited_at.slice(0, 4)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
