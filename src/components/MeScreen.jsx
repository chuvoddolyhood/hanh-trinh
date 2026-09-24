import { useState } from 'react';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';
import { parseGpxFile } from '../lib/gpx';
import { bounds, formatDistance, formatDuration } from '../lib/geo';
import { formatDate, toDateStr } from '../lib/dates';
import Icon from './icons';

const THEMES = [
  { id: 'auto', label: 'Tự động' },
  { id: 'light', label: 'Sáng' },
  { id: 'dark', label: 'Tối' },
];

// Tab Tôi: cài đặt, lộ trình đã lưu, nhập GPX, đăng xuất
export default function MeScreen({ email, theme, onThemeChange, goalKm, onGoalChange, tracks, onChanged, onShowTrack }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [password, setPassword] = useState('');
  const [pwMessage, setPwMessage] = useState(null);

  // Đặt/đổi mật khẩu (tài khoản tạo bằng link email chưa có mật khẩu)
  async function savePassword(e) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setPassword('');
    const errors = {
      same_password: 'Mật khẩu mới trùng mật khẩu cũ.',
      weak_password: 'Mật khẩu quá yếu. Dùng ít nhất 6 ký tự.',
    };
    setPwMessage(error ? (errors[error.code] ?? error.message) : 'Đã lưu mật khẩu.');
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
    <div className="screen">
      <div className="screen-inner stack">
        <header className="screen-head">
          <span className="mono-label wide">TÀI KHOẢN</span>
          <h1 className="screen-title">Tôi</h1>
          <span className="screen-sub">{email}</span>
        </header>

        <section className="stack-sm">
          <h2 className="section-title">Giao diện</h2>
          <div className="chips">
            {THEMES.map((t) => (
              <button key={t.id} className="chip" aria-pressed={theme === t.id} onClick={() => onThemeChange(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <label className="field">
          <span className="section-title">Mục tiêu đi bộ mỗi ngày (km)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.5"
            max="100"
            step="0.5"
            defaultValue={goalKm}
            onChange={(e) => Number(e.target.value) > 0 && onGoalChange(Number(e.target.value))}
          />
        </label>

        <form className="stack-sm" onSubmit={savePassword}>
          <label className="field">
            <span className="section-title">Đặt mật khẩu mới</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn-pill btn-outline">Lưu mật khẩu</button>
          {pwMessage && <p className="notice">{pwMessage}</p>}
        </form>

        <section className="stack-sm">
          <h2 className="section-title">Lộ trình đã lưu</h2>
          {tracks.length === 0 && <p className="empty">Chưa có lộ trình nào.</p>}
          <ul className="track-list">
            {tracks.map((t) => (
              <li key={t.id}>
                <button className="track-main" onClick={() => onShowTrack(bounds(t.points))}>
                  <span className="track-name">{t.name}</span>
                  <span className="muted-sm">
                    {formatDistance(t.distance_m)}
                    {t.started_at && `, ${formatDate(toDateStr(new Date(t.started_at)))}`}
                    {t.started_at && t.ended_at && `, ${formatDuration(new Date(t.ended_at) - new Date(t.started_at))}`}
                  </span>
                </button>
                <button className="round-btn plain" onClick={() => removeTrack(t)} aria-label={`Xoá ${t.name}`}>
                  <Icon name="close" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Nhập từ ứng dụng khác</h2>
          <p className="help">Ghi lộ trình dài bằng ứng dụng chạy nền được (ví dụ OsmAnd), xuất file GPX rồi nhập vào đây.</p>
          <label className={`btn-pill btn-outline file-btn${busy ? ' is-busy' : ''}`}>
            {busy ? 'Đang nhập…' : 'Chọn file GPX'}
            <input type="file" accept=".gpx,application/gpx+xml" multiple onChange={importGpx} hidden disabled={busy} />
          </label>
          {message && <p className="notice">{message}</p>}
        </section>

        <button className="btn-pill btn-outline" onClick={() => supabase.auth.signOut()}>Đăng xuất</button>
      </div>
    </div>
  );
}
