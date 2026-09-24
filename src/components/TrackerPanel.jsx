import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import { parseGpxFile } from '../lib/gpx';
import { bounds, formatDistance, formatDuration, trackDistance } from '../lib/geo';
import { formatDate, toDateStr } from '../lib/dates';

// Tên mặc định: "Đi bộ 24/09/2026"
const defaultName = (ms) => `Đi bộ ${formatDate(toDateStr(new Date(ms ?? Date.now())))}`;

export default function TrackerPanel({ tracker, tracks, onChanged, onFocus }) {
  const { recording, points, startedAt, accuracy, error, screenLocked, start, stop, reset } = tracker;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Đồng hồ chạy mỗi giây khi đang ghi
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const distance = useMemo(() => trackDistance(points), [points]);
  const hasUnsaved = !recording && points.length > 0;

  async function saveCurrent() {
    if (points.length < 2) {
      setMessage('Lộ trình quá ngắn để lưu. Hãy đi thêm một đoạn rồi thử lại.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.createTrack({ name: name.trim() || defaultName(startedAt), points, source: 'live' });
      reset();
      setName('');
      setMessage('Đã lưu lộ trình.');
      onChanged();
    } catch (e) {
      // Giữ nguyên điểm trong bộ nhớ tạm để người dùng thử lưu lại
      setMessage(`Chưa lưu được: ${e.message}. Lộ trình vẫn được giữ trên máy, hãy thử lại.`);
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (window.confirm('Bỏ lộ trình vừa ghi? Không thể hoàn tác.')) {
      reset();
      setMessage(null);
    }
  }

  async function importGpx(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setMessage(null);
    try {
      let count = 0;
      for (const file of files) {
        for (const t of await parseGpxFile(file)) {
          await api.createTrack({ ...t, source: 'gpx' });
          count += 1;
        }
      }
      setMessage(count ? `Đã nhập ${count} lộ trình.` : 'File không chứa lộ trình nào có từ 2 điểm trở lên.');
      onChanged();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTrack(t) {
    if (!window.confirm(`Xoá lộ trình "${t.name}"?`)) return;
    try {
      await api.deleteTrack(t.id);
      onChanged();
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="stack">
      {/* Khu vực ghi trực tiếp */}
      <section className={`recorder${recording ? ' is-recording' : ''}`}>
        <div className="recorder-readout">
          <div>
            <span className="readout-value">{formatDistance(distance)}</span>
            <span className="readout-label">Quãng đường</span>
          </div>
          <div>
            <span className="readout-value">
              {startedAt ? formatDuration((recording ? now : points.at(-1)?.[2] ?? startedAt) - startedAt) : '00:00'}
            </span>
            <span className="readout-label">Thời gian</span>
          </div>
        </div>

        {!recording && !hasUnsaved && (
          <button className="record-btn" onClick={start} disabled={busy}>
            <span className="record-dot" aria-hidden="true" />
            Bắt đầu ghi
          </button>
        )}

        {recording && (
          <>
            <button className="record-btn is-stop" onClick={stop}>
              <span className="record-square" aria-hidden="true" />
              Dừng
            </button>
            <p className="help">
              {accuracy != null ? `Sai số GPS khoảng ${Math.round(accuracy)} m. ` : 'Đang tìm tín hiệu GPS… '}
              {screenLocked
                ? 'Màn hình được giữ sáng. Đừng tắt màn hình hay chuyển ứng dụng khác.'
                : 'Trình duyệt không giữ được màn hình sáng. Nếu tắt màn hình, việc ghi sẽ bị gián đoạn.'}
            </p>
          </>
        )}

        {hasUnsaved && (
          <div className="stack-sm">
            <p className="help">Có lộ trình chưa lưu với {points.length} điểm.</p>
            <label className="field">
              <span>Tên lộ trình</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName(startedAt)} />
            </label>
            <div className="row">
              <button className="btn btn-primary" onClick={saveCurrent} disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu lộ trình'}
              </button>
              <button className="btn" onClick={discard} disabled={busy}>Bỏ</button>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </section>

      {/* Nhập GPX */}
      <section className="stack-sm">
        <h3 className="section-title">Nhập từ ứng dụng khác</h3>
        <p className="help">
          Ghi lộ trình dài bằng ứng dụng chạy nền được (ví dụ OsmAnd), xuất file GPX rồi nhập vào đây.
        </p>
        <label className="btn file-btn">
          Chọn file GPX
          <input type="file" accept=".gpx,application/gpx+xml" multiple onChange={importGpx} hidden disabled={busy} />
        </label>
      </section>

      {message && <p className="notice">{message}</p>}

      {/* Danh sách đã lưu */}
      <section className="stack-sm">
        <h3 className="section-title">Lộ trình đã lưu</h3>
        {tracks.length === 0 && <p className="empty">Chưa có lộ trình nào.</p>}
        <ul className="tracks">
          {tracks.map((t) => (
            <li key={t.id} className="track">
              <button className="track-main" onClick={() => onFocus({ bounds: bounds(t.points) })}>
                <span className="entry-name">{t.name}</span>
                <span className="entry-meta">
                  {formatDistance(t.distance_m)}
                  {t.started_at && `, ${formatDate(toDateStr(new Date(t.started_at)))}`}
                  {t.started_at && t.ended_at &&
                    `, ${formatDuration(new Date(t.ended_at) - new Date(t.started_at))}`}
                </span>
              </button>
              <button className="icon-btn" onClick={() => removeTrack(t)} aria-label={`Xoá ${t.name}`}>×</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
