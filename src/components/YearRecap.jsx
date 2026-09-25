import { useEffect, useMemo, useState } from 'react';
import Icon from './icons';
import Polaroid from './Polaroid';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { yearRecap } from '../lib/recap';
import { visitedRegions } from '../lib/regions';
import { bounds, formatDistance } from '../lib/geo';
import { formatDate } from '../lib/dates';
import { moodEmoji, moodLabel } from './moods';

const SLIDE_MS = 6000;

/**
 * Tổng kết năm dạng story, phủ trên bản đồ (dùng lại giao diện .story của StoryPlayer).
 * Mỗi trang một con số; bản đồ bên dưới bay tới vùng liên quan qua onFocus. Bỏ các trang không có dữ liệu.
 * onPlayStory(places): xem lại từng nơi trong năm; onMakePoster(args): như makePoster trong App.
 */
export default function YearRecap({ year, places, tracks, provinceSet, onFocus, onClose, onPlayStory, onMakePoster }) {
  const r = useMemo(() => yearRecap(places, tracks, year), [places, tracks, year]);
  const [regions, setRegions] = useState(null); // { count, fresh: tên tỉnh lần đầu đến, countries }
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const urls = usePhotoUrls(r.picks.map((k) => k.photo.storage_path), { thumb: true });

  // Tỉnh trong năm và tỉnh mới (chưa từng đến trước năm này); lỗi tải ranh giới thì bỏ phần tỉnh
  useEffect(() => {
    let alive = true;
    const key = provinceSet === '63' ? 'p63' : 'p34';
    Promise.all([visitedRegions(r.visited), visitedRegions(r.before)])
      .then(([now, then]) => {
        if (!alive) return;
        setRegions({
          count: now[key].size,
          fresh: [...now[key]].filter((n) => !then[key].has(n)),
          countries: [...now.countries.values()],
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [r, provinceSet]);

  const placePts = r.visited.map((p) => [p.lng, p.lat]);
  const allPts = [...placePts, ...r.tracks.flatMap((t) => t.points)];
  const slides = [
    { id: 'intro', points: allPts },
    r.visited.length > 0 && { id: 'places', points: placePts },
    r.longest && { id: 'walk', points: r.longest.points },
    r.topMonth != null && {
      id: 'month',
      points: r.visited.filter((p) => Number(p.visited_at.slice(5, 7)) === r.topMonth + 1).map((p) => [p.lng, p.lat]),
    },
    r.picks.length > 0 && { id: 'photos', points: r.picks.map((k) => [k.place.lng, k.place.lat]) },
    r.first && { id: 'marks', points: [[r.first.lng, r.first.lat]] },
    { id: 'end', points: allPts },
  ].filter(Boolean);
  const slide = slides[Math.min(index, slides.length - 1)];
  const last = index >= slides.length - 1;

  // Bay tới vùng của trang đang xem
  useEffect(() => {
    const pts = slide.points;
    if (pts.length === 1) onFocus({ lng: pts[0][0], lat: pts[0][1], zoom: 13 });
    else if (pts.length) onFocus({ bounds: bounds(pts) });
    // onFocus đổi mỗi lần cha render; chỉ cần chạy khi đổi trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id]);

  // Tự chuyển trang, dừng ở trang cuối
  useEffect(() => {
    if (paused || last) return undefined;
    const id = setTimeout(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => clearTimeout(id);
  }, [index, paused, last]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, onClose]);

  function makePoster() {
    onMakePoster({
      title: `Năm ${year}`,
      label: `Tổng kết ${year}`,
      stats: [
        ['Nơi đã đến', String(r.visited.length)],
        ['Tỉnh, thành', regions ? String(regions.count) : '—'],
        ['Đi bộ', formatDistance(r.distance)],
      ],
      points: allPts,
    });
  }

  const tops = r.months.map((n, i) => (n > 0 && i === r.topMonth ? ' is-top' : ''));

  return (
    <section className="story" aria-label={`Tổng kết năm ${year}`} aria-roledescription="story">
      <div className="story-bars" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={s.id} className="story-bar">
            <span
              className={`story-fill${i === index && !paused && !last ? ' is-running' : ''}`}
              style={{ width: i < index || (last && i === index) ? '100%' : '0%', '--slide': `${SLIDE_MS}ms` }}
            />
          </span>
        ))}
      </div>

      <div className="story-top">
        <span className="story-title">Tổng kết năm {year}</span>
        {!last && (
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

      <button
        type="button"
        className="story-tap story-prev"
        onClick={() => setIndex((i) => Math.max(i - 1, 0))}
        aria-label="Trang trước"
      />
      {!last && (
        <button type="button" className="story-tap story-next" onClick={() => setIndex(index + 1)} aria-label="Trang tiếp theo" />
      )}

      <article className="story-card" key={slide.id} aria-live="polite">
        {slide.id === 'intro' && (
          <>
            {r.picks.length > 0 && (
              <div className="story-photos">
                {r.picks.slice(0, 3).map((k, i) => (
                  <Polaroid
                    key={k.photo.id}
                    src={urls[k.photo.storage_path]}
                    alt={`Ảnh tại ${k.place.name}`}
                    tilt={[-4, 3, -2][i]}
                  />
                ))}
              </div>
            )}
            <span className="mono-label">TỔNG KẾT NĂM</span>
            <h2 className="recap-big">{year}</h2>
            <p className="muted">
              {[
                r.visited.length > 0 && `${r.visited.length} nơi đã đến`,
                r.distance > 0 && `${formatDistance(r.distance)} đi bộ`,
                r.photos > 0 && `${r.photos} ảnh`,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          </>
        )}

        {slide.id === 'places' && (
          <>
            <span className="mono-label">NƠI ĐÃ ĐẾN</span>
            <h2 className="recap-big">{r.visited.length}</h2>
            {regions && (
              <p>
                {regions.count > 0 && `${regions.count} tỉnh, thành`}
                {regions.fresh.length > 0 &&
                  `, trong đó ${regions.fresh.length} nơi lần đầu đến: ${regions.fresh.slice(0, 5).join(', ')}${regions.fresh.length > 5 ? '…' : ''}`}
                {regions.countries.length > 1 && `. ${regions.countries.length} quốc gia: ${regions.countries.join(', ')}`}
                .
              </p>
            )}
          </>
        )}

        {slide.id === 'walk' && (
          <>
            <span className="mono-label">ĐI BỘ</span>
            <h2 className="recap-big">{formatDistance(r.distance)}</h2>
            <p>
              {r.tracks.length} lộ trình. Dài nhất: {r.longest.name}, {formatDistance(r.longest.distance_m)}.
            </p>
          </>
        )}

        {slide.id === 'month' && (
          <>
            <span className="mono-label">THÁNG ĐI NHIỀU NHẤT</span>
            <h2 className="recap-big">Tháng {r.topMonth + 1}</h2>
            <p>{r.months[r.topMonth]} nơi đã đến trong tháng.</p>
            <div
              className="recap-bars"
              role="img"
              aria-label={r.months.map((n, i) => `tháng ${i + 1}: ${n}`).join(', ')}
            >
              {r.months.map((n, i) => (
                <span key={i} className="recap-bar">
                  <span className={`recap-fill${tops[i]}`} style={{ height: `${Math.round((n / r.months[r.topMonth]) * 64)}px` }} />
                  <small>{i + 1}</small>
                </span>
              ))}
            </div>
          </>
        )}

        {slide.id === 'photos' && (
          <>
            <span className="mono-label">KHOẢNH KHẮC</span>
            <p className="muted">{r.photos} ảnh ở {r.visited.filter((p) => p.photos.length).length} nơi</p>
            <div className="recap-photos">
              {r.picks.map((k, i) => (
                <Polaroid
                  key={k.photo.id}
                  src={urls[k.photo.storage_path]}
                  alt={`Ảnh tại ${k.place.name}`}
                  caption={k.place.name}
                  tilt={[-3, 2, -2, 3, -4, 2][i]}
                />
              ))}
            </div>
          </>
        )}

        {slide.id === 'marks' && (
          <>
            <span className="mono-label">DẤU ẤN</span>
            <dl className="recap-list">
              <div>
                <dt>NƠI ĐẦU TIÊN</dt>
                <dd>{r.first.name}, {formatDate(r.first.visited_at)}</dd>
              </div>
              {r.last !== r.first && (
                <div>
                  <dt>NƠI GẦN NHẤT</dt>
                  <dd>{r.last.name}, {formatDate(r.last.visited_at)}</dd>
                </div>
              )}
              {r.topTag && (
                <div>
                  <dt>TAG NHIỀU NHẤT</dt>
                  <dd>#{r.topTag[0]} ({r.topTag[1]} lần)</dd>
                </div>
              )}
              {r.topMood && (
                <div>
                  <dt>CẢM XÚC NHIỀU NHẤT</dt>
                  <dd>
                    <span aria-hidden="true">{moodEmoji(r.topMood[0])}</span> {moodLabel(r.topMood[0])} ({r.topMood[1]} lần)
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}

        {slide.id === 'end' && (
          <div className="story-end stack-sm">
            <h2 className="story-name">Năm {year} của bạn</h2>
            <div className="row">
              {r.visited.length > 0 && (
                <button type="button" className="btn-pill btn-dark" onClick={() => onPlayStory(r.visited)}>
                  Xem lại từng nơi
                </button>
              )}
              <button type="button" className="btn-pill btn-outline" onClick={makePoster}>
                Tạo poster năm
              </button>
              <button type="button" className="btn-pill btn-outline" onClick={() => setIndex(0)}>
                Xem lại
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
