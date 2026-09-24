import { useMemo, useState } from 'react';
import { normalizeVi } from '../lib/text';
import { formatDate, formatMonth } from '../lib/dates';
import { formatDistance } from '../lib/geo';
import { moodEmoji } from './moods';

// Danh sách nhật ký: thống kê nhanh, bộ lọc, nhóm theo tháng
// query được giữ ở App để bấm #tag trong trang chi tiết có thể lọc ngược về đây
export default function Timeline({ places, tracks, onSelect, query, onQueryChange: setQuery }) {
  const [kind, setKind] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const stats = useMemo(
    () => ({
      visited: places.filter((p) => p.kind === 'visited').length,
      wishlist: places.filter((p) => p.kind === 'wishlist').length,
      distance: tracks.reduce((sum, t) => sum + (t.distance_m || 0), 0),
    }),
    [places, tracks],
  );

  const filtered = useMemo(() => {
    const q = normalizeVi(query);
    const isTagQuery = q.startsWith('#');
    const tagQ = q.slice(1);

    return places.filter((p) => {
      if (kind !== 'all' && p.kind !== kind) return false;
      // Lọc ngày: so sánh chuỗi YYYY-MM-DD là đủ chính xác
      if (from && (!p.visited_at || p.visited_at < from)) return false;
      if (to && (!p.visited_at || p.visited_at > to)) return false;
      if (!q) return true;
      if (isTagQuery) return p.tags.some((t) => normalizeVi(t).startsWith(tagQ));
      return normalizeVi([p.name, p.note, ...p.tags].join(' ')).includes(q);
    });
  }, [places, query, kind, from, to]);

  // Nhóm theo tháng; địa điểm chưa có ngày (thường là wishlist) để cuối
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.visited_at ? p.visited_at.slice(0, 7) : 'none';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()];
  }, [filtered]);

  const hasFilter = query || kind !== 'all' || from || to;

  return (
    <div className="stack">
      <dl className="stats">
        <div><dt>Nơi đã đến</dt><dd>{stats.visited}</dd></div>
        <div><dt>Muốn đến</dt><dd>{stats.wishlist}</dd></div>
        <div><dt>Đã đi bộ</dt><dd>{formatDistance(stats.distance)}</dd></div>
      </dl>

      <div className="filters">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên, ghi chú hoặc #tag"
          aria-label="Tìm trong nhật ký"
        />
        <div className="filter-row">
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại địa điểm">
            <option value="all">Tất cả</option>
            <option value="visited">Đã đến</option>
            <option value="wishlist">Muốn đến</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Từ ngày" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Đến ngày" />
        </div>
        {hasFilter && (
          <button
            className="btn-link"
            onClick={() => { setQuery(''); setKind('all'); setFrom(''); setTo(''); }}
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      {places.length === 0 && (
        <p className="empty">Chưa có địa điểm nào. Mở tab Check-in và chạm lên bản đồ để ghim nơi đầu tiên.</p>
      )}
      {places.length > 0 && filtered.length === 0 && (
        <p className="empty">Không có địa điểm khớp bộ lọc.</p>
      )}

      {groups.map(([key, items]) => (
        <section key={key} className="month">
          <h3 className="month-title">{key === 'none' ? 'Chưa đặt ngày' : formatMonth(key)}</h3>
          <ul className="entries">
            {items.map((p) => (
              <li key={p.id}>
                <button className={`entry entry-${p.kind}`} onClick={() => onSelect(p.id)}>
                  <span className="entry-name">
                    {p.mood && <span aria-hidden="true">{moodEmoji(p.mood)} </span>}
                    {p.name}
                  </span>
                  <span className="entry-meta">
                    {p.kind === 'wishlist' ? 'Muốn đến' : formatDate(p.visited_at)}
                    {p.photos.length > 0 && `, ${p.photos.length} ảnh`}
                  </span>
                  {p.tags.length > 0 && (
                    <span className="entry-tags">{p.tags.map((t) => `#${t}`).join(' ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
