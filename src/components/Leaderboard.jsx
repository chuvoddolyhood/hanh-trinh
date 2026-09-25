import { useEffect, useState } from 'react';
import * as api from '../lib/api';

const METRICS = [
  { id: 'places', label: 'Số nơi', unit: 'nơi' },
  { id: 'km', label: 'Km đi bộ', unit: 'km' },
  { id: 'days', label: 'Số ngày đi', unit: 'ngày' },
];

// Tab Tôi: bảng xếp hạng với bạn bè. Tự chọn tham gia; chỉ so số liệu tổng, không lộ vị trí.
export default function Leaderboard({ userId }) {
  const [on, setOn] = useState(null); // null: đang tải
  const [rows, setRows] = useState([]);
  const [thisYear, setThisYear] = useState(true);
  const [metric, setMetric] = useState('places');
  const [error, setError] = useState(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    api.getSettings(userId).then((s) => setOn(s.leaderboard)).catch((e) => setError(e.message));
  }, [userId]);

  useEffect(() => {
    if (!on) return;
    api.getLeaderboard(thisYear ? year : null).then(setRows).catch((e) => setError(e.message));
  }, [on, thisYear, year]);

  async function toggle() {
    setError(null);
    try {
      await api.updateSettings(userId, { leaderboard: !on });
      setOn(!on);
      if (on) setRows([]);
    } catch (e) {
      setError(e.message);
    }
  }

  const unit = METRICS.find((m) => m.id === metric).unit;
  const sorted = [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric]));
  const show = (v) => (metric === 'km' ? String(Number(v)).replace('.', ',') : v);

  return (
    <section className="stack-sm">
      <h2 className="section-title">Bảng xếp hạng bạn bè</h2>
      <p className="help">
        So số nơi đã đến, km đi bộ và số ngày đi với bạn bè cũng tham gia. Chỉ chia sẻ các con số, không chia sẻ vị trí
        hay tên địa điểm.
      </p>
      {on !== null && (
        <button type="button" className="btn-pill btn-outline" onClick={toggle}>
          {on ? 'Rời bảng xếp hạng' : 'Tham gia bảng xếp hạng'}
        </button>
      )}
      {on && (
        <>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={thisYear} onClick={() => setThisYear(true)}>
              Năm {year}
            </button>
            <button type="button" className="chip" aria-pressed={!thisYear} onClick={() => setThisYear(false)}>
              Mọi năm
            </button>
          </div>
          <div className="chips">
            {METRICS.map((m) => (
              <button type="button" key={m.id} className="chip" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <ol className="leaderboard">
            {sorted.map((r, i) => (
              <li key={r.user_id} className={r.is_me ? 'is-me' : ''}>
                <span className="leaderboard-rank">{i + 1}</span>
                <span className="track-name">{r.is_me ? 'Bạn' : r.display_name}</span>
                <span className="leaderboard-value">{show(r[metric])} {unit}</span>
              </li>
            ))}
          </ol>
          {sorted.length === 1 && <p className="help">Chưa có bạn bè nào tham gia. Rủ bạn bè bật ở tab Tôi của họ.</p>}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
