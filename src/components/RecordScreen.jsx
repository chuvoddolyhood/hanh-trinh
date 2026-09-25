import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';
import { formatDuration, formatPace, trackDistance } from '../lib/geo';
import { formatDate, partOfDay, toDateStr } from '../lib/dates';
import { enqueue, isNetworkError } from '../lib/outbox';

// Tên mặc định: "Đi bộ 24/09/2026"
const defaultName = (ms) => `Đi bộ ${formatDate(toDateStr(new Date(ms ?? Date.now())))}`;

// Chiếu lộ trình vào khung trời 390×420 (giữ tỉ lệ, chừa lề cho thanh trên và tấm dưới)
function projectRoute(points) {
  if (!points.length) return null;
  const lats = points.map((p) => p[1]);
  const kx = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180));
  const xs = points.map((p) => p[0] * kx);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...lats), maxY = Math.max(...lats);
  const box = { x: 50, y: 90, w: 290, h: 250 };
  const scale = Math.min(box.w / (maxX - minX || 1e-9), box.h / (maxY - minY || 1e-9));
  const ox = box.x + (box.w - (maxX - minX) * scale) / 2;
  const oy = box.y + (box.h - (maxY - minY) * scale) / 2;
  return points.map((p, i) => [ox + (xs[i] - minX) * scale, oy + (maxY - p[1]) * scale]);
}

export default function RecordScreen({ tracker, userId, goalKm, onMinimize, onSaved }) {
  const { recording, paused, points, startedAt, pausedMs, pausedAt, accuracy, error, screenLocked } = tracker;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Đồng hồ chạy mỗi giây khi đang ghi
  useEffect(() => {
    if (!recording || paused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  const distance = useMemo(() => trackDistance(points), [points]);
  const route = useMemo(() => projectRoute(points), [points]);
  const hasUnsaved = !recording && points.length > 0;
  const idle = !recording && !hasUnsaved;

  let endMs = points.at(-1)?.[2] ?? startedAt;
  if (recording) endMs = paused ? pausedAt : now;
  const elapsed = startedAt ? endMs - startedAt - pausedMs : 0;
  const goalPct = Math.min(100, Math.round((distance / (goalKm * 1000)) * 100));

  let status = 'SẴN SÀNG';
  if (paused) status = 'TẠM DỪNG';
  else if (recording) status = accuracy != null ? `ĐANG GHI, GPS ±${Math.round(accuracy)} m` : 'ĐANG TÌM GPS…';
  else if (hasUnsaved) status = 'ĐÃ DỪNG';

  async function save() {
    if (points.length < 2) {
      setMessage('Lộ trình quá ngắn để lưu. Hãy đi thêm một đoạn rồi thử lại.');
      return;
    }
    setBusy(true);
    setMessage(null);
    // id tạo sẵn: mất mạng giữa chừng rồi gửi lại từ hàng chờ không bị trùng
    const track = { id: crypto.randomUUID(), name: name.trim() || defaultName(startedAt), points, source: 'live' };
    try {
      let queued = false;
      try {
        await api.createTrack(track);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        await enqueue(userId, 'track', track);
        queued = true;
      }
      tracker.reset();
      setName('');
      setMessage(queued ? 'Đang mất mạng: đã lưu trên máy, sẽ tự đồng bộ khi có mạng.' : 'Đã lưu lộ trình.');
      onSaved();
    } catch (e) {
      // Giữ nguyên điểm trong bộ nhớ tạm để người dùng thử lưu lại
      setMessage(`Chưa lưu được: ${e.message}. Lộ trình vẫn được giữ trên máy, hãy thử lại.`);
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (window.confirm('Bỏ lộ trình vừa ghi? Không thể hoàn tác.')) {
      tracker.reset();
      setMessage(null);
    }
  }

  return (
    <div className="screen record">
      <div className="record-sky" aria-hidden="true">
        <svg className="grain" width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
        {route && (
          <svg className="record-route" viewBox="0 0 390 420" preserveAspectRatio="xMidYMin meet">
            {route.length > 1 && <polyline points={route.map((p) => p.join(',')).join(' ')} />}
            <circle cx={route[0][0]} cy={route[0][1]} r="6" />
            <circle cx={route.at(-1)[0]} cy={route.at(-1)[1]} r="18" opacity="0.3" />
            <circle cx={route.at(-1)[0]} cy={route.at(-1)[1]} r="8" />
          </svg>
        )}
      </div>

      <div className="top-bar">
        <button
          type="button"
          className="round-btn on-sky"
          onClick={onMinimize}
          aria-label={recording ? 'Thu nhỏ, vẫn tiếp tục ghi' : 'Đóng'}
        >
          <Icon name="down" size={20} strokeWidth={2} />
        </button>
        <span className="sky-chip">
          <span className={`sky-dot${recording && !paused ? ' is-live' : ''}`} />
          {status}
        </span>
      </div>

      <section className="record-sheet">
        <div className="sheet-row">
          <span className="mono-label wide">
            {startedAt ? `ĐI BỘ ${partOfDay(new Date(startedAt)).toUpperCase()}` : 'GHI LỘ TRÌNH'}
          </span>
          <span className="mono-label">{formatDate(toDateStr(new Date(startedAt ?? now))).replaceAll('/', '.')}</span>
        </div>

        <div className="big-number">
          {(distance / 1000).toFixed(2).replace('.', ',')}<span>km</span>
        </div>

        <dl className="metrics">
          <div><dt>THỜI GIAN</dt><dd>{formatDuration(elapsed)}</dd></div>
          <div><dt>TỐC ĐỘ TB</dt><dd>{formatPace(elapsed, distance)}<small>/km</small></dd></div>
        </dl>

        <div className="goal">
          <div className="sheet-row">
            <span className="mono-label">MỤC TIÊU HÔM NAY</span>
            <span className="mono-label">{String(goalKm).replace('.', ',')} km</span>
          </div>
          <div className={`goal-bar${goalPct < 12 ? ' is-low' : ''}`} role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ mục tiêu">
            <div className="goal-fill" style={{ width: `${goalPct}%` }} />
            <span>{goalPct}<small>%</small></span>
          </div>
        </div>

        {recording && (
          <p className="help">
            {screenLocked || paused
              ? 'Giữ trang này mở. Tắt màn hình hay chuyển ứng dụng khác sẽ làm gián đoạn việc ghi.'
              : 'Trình duyệt không giữ được màn hình sáng. Nếu tắt màn hình, việc ghi sẽ bị gián đoạn.'}
          </p>
        )}
        {idle && (
          <p className="help">
            Lộ trình dài nên ghi bằng ứng dụng chạy nền (ví dụ OsmAnd) rồi nhập file GPX ở tab Tôi.
          </p>
        )}
        {hasUnsaved && (
          <label className="field">
            <span>Tên lộ trình</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName(startedAt)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}

        <div className="record-actions">
          {idle && (
            <button type="button" className="btn-pill btn-dark" onClick={tracker.start}>
              <span className="rec-square" aria-hidden="true" />
              {'Bắt đầu ghi'}
            </button>
          )}
          {recording && (
            <>
              <button type="button" className="btn-pill btn-outline" onClick={paused ? tracker.resume : tracker.pause}>
                <Icon name={paused ? 'play' : 'pause'} size={18} />
                {paused ? 'Tiếp tục' : 'Tạm dừng'}
              </button>
              <button type="button" className="btn-pill btn-dark" onClick={tracker.stop}>
                <span className="rec-square" aria-hidden="true" />
                {'Kết thúc'}
              </button>
            </>
          )}
          {hasUnsaved && (
            <>
              <button type="button" className="btn-pill btn-outline" onClick={discard} disabled={busy}>Bỏ</button>
              <button type="button" className="btn-pill btn-dark" onClick={save} disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu lộ trình'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
