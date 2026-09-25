import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';
import { bounds, formatDistance, haversine } from '../lib/geo';
import { formatDate, todayStr } from '../lib/dates';
import { fetchDailyWeather, fetchForecast } from '../lib/weather';
import { planOrder } from '../lib/plan';
import { balances, settle, formatVnd } from '../lib/expenses';

const VISIBILITY = [
  { id: 'private', label: 'Riêng tư' },
  { id: 'unlisted', label: 'Có link' },
  { id: 'public', label: 'Công khai' },
];

// Ngày YYYY-MM-DD của một thời điểm theo múi giờ của chuyến (khớp với hàm shared_trip trên server)
const dayIn = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });

// Chuyến đi gom theo khoảng ngày: nơi đã đến trong khoảng và lộ trình bắt đầu trong khoảng
export function tripItems(trip, places, tracks) {
  const inRange = (d) => d >= trip.start_date && d <= trip.end_date;
  return {
    places: places
      .filter((p) => p.kind === 'visited' && inRange(p.visited_at))
      .sort((a, b) => a.visited_at.localeCompare(b.visited_at)),
    tracks: tracks.filter((t) => t.started_at && inRange(dayIn(t.started_at, trip.tz))),
  };
}

// /s/<token> đi qua api/share.js để Zalo, Facebook hiện ảnh bìa (vercel.json)
const shareUrl = (trip) => `${window.location.origin}/s/${trip.share_token}`;
const dateRange = (t) =>
  t.start_date === t.end_date ? formatDate(t.start_date) : `${formatDate(t.start_date)} – ${formatDate(t.end_date)}`;
const dayCount = (t) => Math.round((new Date(t.end_date) - new Date(t.start_date)) / 864e5) + 1;

// Tab Chuyến đi: danh sách, tạo/sửa chuyến, xem chi tiết và bật link chia sẻ
// onOpenPlace(place, ownerName): ownerName có giá trị khi là nơi của thành viên khác
// onDataChanged(): tải lại nơi, lộ trình của mình ở App (sau khi gắn/gỡ khỏi chuyến nhóm)
// onShowPlan(name, [[lng, lat], ...]): vẽ kế hoạch (điểm dừng theo thứ tự) trên bản đồ
export default function TripsScreen({ userId, places, tracks, onOpenPlace, onShowOnMap, onShowPlan, onDataChanged, onPlayStory, onMakePoster }) {
  const [trips, setTrips] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (tạo mới) | trip (sửa)

  async function load() {
    try {
      setTrips(await api.listTrips());
      setError(null);
    } catch (e) {
      setError(`Không tải được chuyến đi: ${e.message}`);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { load(); }, []);

  const open = trips.find((t) => t.id === openId);

  if (editing) {
    return (
      <TripForm
        trip={editing.id ? editing : null}
        onCancel={() => setEditing(null)}
        onSaved={async (t) => { await load(); setEditing(null); setOpenId(t.id); }}
        onDeleted={async () => { await load(); setEditing(null); setOpenId(null); }}
      />
    );
  }

  if (open) {
    return (
      <TripDetail
        trip={open}
        userId={userId}
        own={tripItems(open, places, tracks)}
        wishlist={places.filter((p) => p.kind === 'wishlist' && p.pending?.kind !== 'create')}
        onBack={() => setOpenId(null)}
        onEdit={() => setEditing(open)}
        // Có trip mới (đổi chia sẻ) → thay tại chỗ; không có → tải lại cả danh sách và dữ liệu của mình
        onChanged={async (t) => {
          if (t) setTrips((list) => list.map((x) => (x.id === t.id ? t : x)));
          else await Promise.all([load(), onDataChanged()]);
        }}
        onLeft={async () => { setOpenId(null); await load(); }}
        onOpenPlace={onOpenPlace}
        onShowOnMap={onShowOnMap}
        onShowPlan={onShowPlan}
        onPlayStory={onPlayStory}
        onMakePoster={onMakePoster}
      />
    );
  }

  return (
    <div className="screen">
      <div className="screen-inner stack">
        <header className="screen-head">
          <span className="mono-label wide">CHUYẾN ĐI CỦA TÔI</span>
          <h1 className="screen-title">Chuyến đi</h1>
          <span className="screen-sub">gom địa điểm và lộ trình theo ngày</span>
        </header>

        <button type="button" className="btn-pill btn-dark" onClick={() => setEditing({})}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          {'Tạo chuyến đi'}
        </button>

        {error && <p className="error">{error}</p>}
        {loaded && !error && trips.length === 0 && (
          <p className="empty">Chưa có chuyến đi nào. Tạo chuyến với khoảng ngày; các nơi đã đến và lộ trình trong khoảng đó tự vào chuyến.</p>
        )}

        <ul className="trip-list">
          {trips.map((t) => {
            const items = tripItems(t, places, tracks);
            const km = items.tracks.reduce((s, x) => s + (x.distance_m || 0), 0);
            const summary = [
              t.user_id === userId ? `${items.places.length} nơi` : `nhóm của ${t.owner?.display_name ?? '…'}`,
              t.user_id === userId && km > 0 && formatDistance(km),
              t.members.length > 0 && `${t.members.length + 1} người`,
              t.user_id === userId && t.visibility !== 'private' && 'đang chia sẻ',
            ].filter(Boolean).join(', ');
            return (
              <li key={t.id}>
                <button type="button" className="trip-card" onClick={() => setOpenId(t.id)}>
                  <span className="mono-label">{dateRange(t)}</span>
                  <span className="tl-name">{t.name}</span>
                  <span className="muted-sm">{summary}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// Chuyến nhóm: có thành viên, hoặc mình là thành viên chuyến của người khác
const isGroup = (trip, userId) => trip.user_id !== userId || trip.members.length > 0;

// Gộp danh sách, bỏ trùng theo id (nơi của chủ vừa trong khoảng ngày vừa được chọn cho nhóm)
const unique = (list) => [...new Map(list.map((x) => [x.id, x])).values()];

function TripDetail({ trip, userId, own, wishlist, onBack, onEdit, onChanged, onLeft, onOpenPlace, onShowOnMap, onShowPlan, onPlayStory, onMakePoster }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [group, setGroup] = useState({ places: [], tracks: [] }); // Mục mọi người đã chọn cho nhóm
  const isOwner = trip.user_id === userId;
  const grouped = isGroup(trip, userId);

  const loadGroup = useCallback(async () => {
    try {
      setGroup(await api.listTripItems(trip.id));
    } catch (e) {
      setMessage(e.message);
    }
  }, [trip.id]);

  useEffect(() => {
    if (grouped) loadGroup();
  }, [grouped, loadGroup]);

  // Kế hoạch: nơi muốn đến gắn vào chuyến (của mình + của thành viên), sắp theo đường đi ngắn
  const planned = unique([
    ...wishlist.filter((p) => p.trip_id === trip.id),
    ...group.places.filter((p) => p.kind === 'wishlist'),
  ]);
  const stops = planOrder(planned.map((p) => [p.lng, p.lat])).map((i) => planned[i]);

  // Chủ thấy mọi nơi của mình trong khoảng ngày + mục nhóm; thành viên chỉ thấy mục nhóm
  const items = {
    places: unique([...(isOwner ? own.places : []), ...group.places])
      .filter((p) => p.visited_at)
      .sort((a, b) => a.visited_at.localeCompare(b.visited_at)),
    tracks: unique([...(isOwner ? own.tracks : []), ...group.tracks]),
  };
  const names = Object.fromEntries(
    [trip.owner, ...trip.members.map((m) => m.profile)].filter(Boolean).map((p) => [p.id, p.display_name]),
  );
  const author = (x) => (x.user_id && x.user_id !== userId ? names[x.user_id] : null);
  const km = items.tracks.reduce((s, x) => s + (x.distance_m || 0), 0);
  // Bản đồ chỉ vẽ dữ liệu của mình → khung nhìn theo mục của mình
  const myPoints = [
    ...items.places.filter((p) => !author(p)).map((p) => [p.lng, p.lat]),
    ...items.tracks.filter((t) => !author(t)).flatMap((t) => t.points),
  ];

  async function run(action, done) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  const change = (fields, done) => run(async () => onChanged(await api.updateTrip(trip.id, fields)), done);

  async function share() {
    const url = shareUrl(trip);
    try {
      if (navigator.share) await navigator.share({ title: trip.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Đã sao chép link.');
      }
    } catch {
      // Người dùng huỷ bảng chia sẻ: không cần báo
    }
  }

  function renewLink() {
    if (!window.confirm('Tạo link mới? Link cũ sẽ không mở được nữa.')) return;
    change({ share_token: crypto.randomUUID() }, 'Đã tạo link mới.');
  }

  function leave() {
    if (!window.confirm(`Rời chuyến "${trip.name}"? Nơi, lộ trình bạn đã chia sẻ sẽ được gỡ khỏi chuyến.`)) return;
    run(async () => {
      await api.removeTripMember(trip.id, userId);
      onLeft();
    });
  }

  // Đổi chọn chia sẻ một mục của mình với nhóm
  function toggleItem(table, item) {
    const shared = item.trip_id === trip.id;
    run(async () => {
      await api.setItemTrip(table, item.id, shared ? null : trip.id);
      await Promise.all([loadGroup(), onChanged()]);
    });
  }

  // Mục của mình trong khoảng ngày (own đã lọc theo ngày); mục đã gắn chuyến nhóm khác thì không chọn được ở đây
  const mine = {
    places: own.places.filter((p) => !p.trip_id || p.trip_id === trip.id),
    tracks: own.tracks.filter((t) => !t.trip_id || t.trip_id === trip.id),
  };

  return (
    <div className="screen">
      <div className="screen-inner stack">
        <div className="row trip-actions">
          <button type="button" className="round-btn" onClick={onBack} aria-label="Quay lại danh sách chuyến đi">
            <Icon name="back" size={20} strokeWidth={2} />
          </button>
          {myPoints.length > 0 && (
            <button type="button" className="round-btn" onClick={() => onShowOnMap(bounds(myPoints))} aria-label="Xem chuyến trên bản đồ">
              <Icon name="map" size={20} />
            </button>
          )}
        </div>

        <header className="screen-head">
          <span className="mono-label wide">{dateRange(trip)}</span>
          <h1 className="screen-title trip-title">{trip.name}</h1>
          {!isOwner && <span className="screen-sub">chuyến nhóm của {trip.owner?.display_name}</span>}
        </header>

        <dl className="stat-row">
          <div><dt>NƠI ĐÃ ĐẾN</dt><dd>{items.places.length}</dd></div>
          <div><dt>ĐI BỘ</dt><dd>{km ? formatDistance(km).split(' ')[0] : '0'}<small> {km ? formatDistance(km).split(' ')[1] : 'km'}</small></dd></div>
          <div><dt>SỐ NGÀY</dt><dd>{dayCount(trip)}</dd></div>
        </dl>

        {trip.note && <p className="note">{trip.note}</p>}
        {items.places.length > 0 && (
          <button type="button" className="btn-pill btn-dark" onClick={() => onPlayStory(trip.name, items.places)}>
            <Icon name="play" size={16} />
            {'Xem lại dạng story'}
          </button>
        )}
        {myPoints.length > 0 && (
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() =>
              onMakePoster({
                title: trip.name,
                label: dateRange(trip),
                stats: [
                  ['Nơi đã đến', String(items.places.length)],
                  ['Đi bộ', formatDistance(km)],
                  ['Số ngày', String(dayCount(trip))],
                ],
                points: myPoints,
              })}
          >
            Tạo poster
          </button>
        )}
        {message && <p className="notice">{message}</p>}

        {isOwner && (
          <section className="stack-sm">
            <h2 className="section-title">Chia sẻ link</h2>
            <div className="chips" role="group" aria-label="Mức chia sẻ">
              {VISIBILITY.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  className="chip"
                  aria-pressed={trip.visibility === v.id}
                  disabled={busy}
                  onClick={() => trip.visibility !== v.id && change({ visibility: v.id })}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {trip.visibility === 'private' ? (
              <p className="help">Chỉ bạn{grouped && ' và thành viên'} xem được chuyến này.</p>
            ) : (
              <>
                <p className="help">
                  Ai có link cũng xem được địa điểm, ảnh và lộ trình của bạn trong chuyến mà không cần đăng nhập
                  (không gồm mục của thành viên). Nơi và đoạn đường nằm trong vùng riêng tư (tab Tôi) được ẩn.
                </p>
                <input readOnly value={shareUrl(trip)} aria-label="Link chia sẻ" onFocus={(e) => e.target.select()} />
                <div className="row">
                  <button type="button" className="btn-pill btn-dark" onClick={share}>Chia sẻ link</button>
                  <button type="button" className="btn-pill btn-outline" onClick={renewLink} disabled={busy}>Tạo link mới</button>
                </div>
              </>
            )}
          </section>
        )}

        <Members trip={trip} userId={userId} busy={busy} run={run} onChanged={onChanged} />

        <Plan
          trip={trip}
          stops={stops}
          choices={wishlist.filter((p) => !p.trip_id)}
          author={author}
          busy={busy}
          run={run}
          reload={() => Promise.all([grouped && loadGroup(), onChanged()])}
          onOpenPlace={onOpenPlace}
          onShowPlan={onShowPlan}
        />

        <TripForecast trip={trip} stops={stops.length ? stops : items.places} />

        <Expenses trip={trip} userId={userId} names={names} />

        <section className="stack-sm">
          <h2 className="section-title">Địa điểm</h2>
          {items.places.length === 0 && <p className="empty">Chưa có nơi đã đến nào trong chuyến.</p>}
          <ul className="results">
            {items.places.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpenPlace(p, author(p))}>
                  <strong>{p.name}</strong>
                  <span>{formatDate(p.visited_at)}{author(p) && `, của ${author(p)}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {items.tracks.length > 0 && (
          <section className="stack-sm">
            <h2 className="section-title">Lộ trình</h2>
            <ul className="track-list">
              {items.tracks.map((t) => (
                <li key={t.id}>
                  {author(t) ? (
                    <span className="track-main">
                      <span className="track-name">{t.name}</span>
                      <span className="muted-sm">{formatDistance(t.distance_m)}, của {author(t)}</span>
                    </span>
                  ) : (
                    <button type="button" className="track-main" onClick={() => onShowOnMap(bounds(t.points))}>
                      <span className="track-name">{t.name}</span>
                      <span className="muted-sm">{formatDistance(t.distance_m)}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {grouped && (mine.places.length > 0 || mine.tracks.length > 0) && (
          <section className="stack-sm">
            <h2 className="section-title">Chia sẻ với nhóm</h2>
            <p className="help">Chọn nơi và lộ trình của bạn trong khoảng ngày này để cả nhóm cùng xem, bình luận.</p>
            <ul className="track-list">
              {[...mine.places.map((p) => ['places', p, p.name, formatDate(p.visited_at)]),
                ...mine.tracks.map((t) => ['tracks', t, t.name, formatDistance(t.distance_m)])]
                .map(([table, x, label, sub]) => (
                  <li key={x.id}>
                    <span className="track-main">
                      <span className="track-name">{label}</span>
                      <span className="muted-sm">{sub}</span>
                    </span>
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={x.trip_id === trip.id}
                      disabled={busy}
                      onClick={() => toggleItem(table, x)}
                    >
                      {x.trip_id === trip.id ? 'Đã chia sẻ' : 'Chia sẻ'}
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        )}

        {isOwner ? (
          <button type="button" className="btn-pill btn-outline" onClick={onEdit}>Sửa chuyến đi</button>
        ) : (
          <button type="button" className="btn-link danger" onClick={leave} disabled={busy}>Rời chuyến</button>
        )}
      </div>
    </div>
  );
}

// Kế hoạch: nơi muốn đến gắn vào chuyến (trip_id), đánh số theo thứ tự đi; đến nơi thì "Đã đến" một chạm.
// Mỗi người chỉ thêm, gỡ, check-in nơi của mình (RLS); thứ tự tự tính nên không cần lưu.
function Plan({ trip, stops, choices, author, busy, run, reload, onOpenPlace, onShowPlan }) {
  const [pick, setPick] = useState('');
  const total = stops.reduce((s, p, i) => (i ? s + haversine([stops[i - 1].lng, stops[i - 1].lat], [p.lng, p.lat]) : 0), 0);

  function markVisited(p) {
    run(async () => {
      const today = todayStr();
      const weather = await fetchDailyWeather(p.lat, p.lng, today).catch(() => null);
      await api.markVisited(p.id, today, weather);
      await reload();
    }, `Đã check-in ${p.name}.`);
  }

  return (
    <section className="stack-sm">
      <h2 className="section-title">Kế hoạch</h2>
      {stops.length === 0 ? (
        <p className="help">Thêm nơi muốn đến vào chuyến; thứ tự đi được sắp theo đường ngắn nhất.</p>
      ) : (
        <>
          <p className="help">
            {stops.length} điểm dừng
            {stops.length > 1 && `, khoảng ${formatDistance(total)} đường chim bay`}. Thứ tự sắp theo đường ngắn nhất.
          </p>
          <ol className="plan-list">
            {stops.map((p, i) => (
              <li key={p.id}>
                <span className="plan-n" aria-hidden="true">{i + 1}</span>
                <button type="button" className="track-main" onClick={() => onOpenPlace(p, author(p))}>
                  <span className="track-name">{p.name}</span>
                  <span className="muted-sm">
                    {[
                      author(p) && `của ${author(p)}`,
                      i < stops.length - 1 &&
                        `tới điểm sau ${formatDistance(haversine([p.lng, p.lat], [stops[i + 1].lng, stops[i + 1].lat]))}`,
                    ].filter(Boolean).join(', ')}
                  </span>
                </button>
                {!author(p) && (
                  <>
                    <button type="button" className="chip" disabled={busy} onClick={() => markVisited(p)}>
                      Đã đến
                    </button>
                    <button
                      type="button"
                      className="round-btn plain"
                      disabled={busy}
                      onClick={() => run(async () => { await api.setItemTrip('places', p.id, null); await reload(); })}
                      aria-label={`Bỏ ${p.name} khỏi kế hoạch`}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn-pill btn-outline"
            onClick={() => onShowPlan(trip.name, stops.map((p) => [p.lng, p.lat]))}
          >
            <Icon name="map" size={18} />
            {'Xem kế hoạch trên bản đồ'}
          </button>
        </>
      )}
      {choices.length > 0 ? (
        <div className="search-row">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Chọn nơi muốn đến để thêm vào kế hoạch">
            <option value="">Chọn nơi muốn đến…</option>
            {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            type="button"
            className="btn"
            disabled={busy || !pick}
            onClick={() => run(async () => { await api.setItemTrip('places', pick, trip.id); setPick(''); await reload(); })}
          >
            Thêm
          </button>
        </div>
      ) : (
        <p className="help">Lưu nơi muốn đến bằng Check-in → "Muốn đến" để thêm vào kế hoạch.</p>
      )}
    </section>
  );
}

const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

// Dự báo thời tiết các ngày của chuyến còn trong 16 ngày tới, tại tâm các điểm dừng (hoặc nơi đã đến)
function TripForecast({ trip, stops }) {
  const [days, setDays] = useState(null);
  const [error, setError] = useState(null);
  const today = todayStr();
  const from = trip.start_date > today ? trip.start_date : today;
  const to = trip.end_date < addDays(today, 15) ? trip.end_date : addDays(today, 15);
  const inWindow = from <= to;
  const lat = stops.length ? stops.reduce((s, p) => s + p.lat, 0) / stops.length : null;
  const lng = stops.length ? stops.reduce((s, p) => s + p.lng, 0) / stops.length : null;
  const key = lat == null ? '' : `${lat.toFixed(2)},${lng.toFixed(2)},${from},${to}`;

  useEffect(() => {
    if (!inWindow || !key) return undefined;
    let alive = true;
    setError(null);
    fetchForecast(lat, lng, from, to)
      .then((d) => alive && setDays(d))
      .catch(() => alive && setError('Chưa lấy được dự báo. Kiểm tra mạng rồi mở lại chuyến.'));
    return () => { alive = false; };
    // key gom lat, lng, from, to (làm tròn để không gọi lại khi toạ độ lệch rất nhỏ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, inWindow]);

  if (!inWindow) return null;
  return (
    <section className="stack-sm">
      <h2 className="section-title">Dự báo thời tiết</h2>
      {!key && <p className="help">Thêm nơi vào Kế hoạch để xem dự báo cho chuyến.</p>}
      {key && !days && !error && <p className="help">Đang lấy dự báo…</p>}
      {error && <p className="help">{error}</p>}
      {days && (
        <>
          <p className="help">Quanh {stops[0].name}{stops.length > 1 && ` và ${stops.length - 1} nơi khác`}.</p>
          <ul className="forecast">
            {days.map((d) => (
              <li key={d.date}>
                <span className="mono-label">{formatDate(d.date).slice(0, 5)}</span>
                <span className="forecast-text">{d.text}</span>
                <span className="forecast-temp">{Math.round(d.tmin)}–{Math.round(d.tmax)}°</span>
                <span className="muted-sm">{d.rain != null ? `mưa ${d.rain}%` : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// Chi phí: ai trả, chia cho ai; cuối cùng tính ai trả ai. Người trong chuyến = chủ + thành viên.
function Expenses({ trip, userId, names }) {
  const people = [trip.owner, ...trip.members.map((m) => m.profile)].filter(Boolean);
  const nameOf = (id) => (id === userId ? 'Bạn' : (names[id] ?? 'Người đã rời chuyến'));
  const [list, setList] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); // null | 'new' | khoản đang sửa
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(userId);
  const [split, setSplit] = useState(null); // null = mọi người

  const load = useCallback(
    () => api.listExpenses(trip.id).then(setList).catch((e) => setError(e.message)),
    [trip.id],
  );
  // Tải lần đầu, rồi tải lại mỗi khi có người trong chuyến thêm, sửa, xoá khoản chi
  useEffect(() => {
    load();
    return api.subscribeExpenses(trip.id, load);
  }, [trip.id, load]);

  function openForm(e) {
    setForm(e ?? 'new');
    setTitle(e?.title ?? '');
    setAmount(e ? String(e.amount) : '');
    setPaidBy(e?.paid_by ?? userId);
    setSplit(e?.split_among ?? null);
  }

  const total = list.reduce((s, e) => s + e.amount, 0);
  const transfers = settle(balances(list));
  const splitIds = split ?? people.map((p) => p.id);
  const value = Number(amount.replace(/\D/g, ''));

  async function act(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!value || !splitIds.length) return;
    act(async () => {
      const fields = { paid_by: paidBy, title: title.trim(), amount: value, split_among: splitIds };
      if (form === 'new') await api.addExpense({ ...fields, trip_id: trip.id, spent_on: todayStr() });
      else await api.updateExpense(form.id, fields);
      setForm(null);
    });
  }

  const toggle = (id) => setSplit(splitIds.includes(id) ? splitIds.filter((x) => x !== id) : [...splitIds, id]);
  const canEdit = (e) => e.created_by === userId || trip.user_id === userId;

  return (
    <section className="stack-sm">
      <h2 className="section-title">Chi phí</h2>
      {list.length > 0 && (
        <p className="help">
          Tổng {formatVnd(total)}
          {people.length > 1 && `, trung bình ${formatVnd(Math.round(total / people.length))} mỗi người`}.
        </p>
      )}

      {people.length > 1 && transfers.length > 0 && (
        <ul className="track-list">
          {transfers.map((t) => (
            <li key={`${t.from}-${t.to}`}>
              <span className="track-main">
                <span className="track-name">{nameOf(t.from)} trả {nameOf(t.to)}</span>
                <span className="muted-sm">{formatVnd(t.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {people.length > 1 && list.length > 0 && transfers.length === 0 && <p className="help">Mọi người đã chia đều, không ai nợ ai.</p>}

      {list.length > 0 && (
        <ul className="track-list expense-list">
          {list.map((e) => (
            <li key={e.id}>
              <button type="button" className="track-main" disabled={!canEdit(e)} onClick={() => openForm(e)}>
                <span className="track-name">{e.title}</span>
                <span className="muted-sm">
                  {formatVnd(e.amount)}, {formatDate(e.spent_on)}
                  {people.length > 1 && `, ${nameOf(e.paid_by)} trả, chia ${e.split_among.length} người`}
                </span>
              </button>
              {canEdit(e) && (
                <button
                  type="button"
                  className="round-btn plain"
                  disabled={busy}
                  onClick={() => window.confirm(`Xoá khoản "${e.title}"?`) && act(() => api.deleteExpense(e.id))}
                  aria-label={`Xoá khoản ${e.title}`}
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <form className="stack-sm" onSubmit={submit}>
          {form !== 'new' && <p className="help">Sửa khoản "{form.title}"</p>}
          <label className="field">
            <span>Khoản chi</span>
            <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Ăn tối, taxi" />
          </label>
          <label className="field">
            <span>Số tiền (đồng)</span>
            <input
              required
              inputMode="numeric"
              value={value ? value.toLocaleString('vi-VN') : ''}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="VD: 250.000"
            />
          </label>
          {people.length > 1 && (
            <>
              <label className="field">
                <span>Người trả</span>
                <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                  {people.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
                </select>
              </label>
              <fieldset>
                <legend>Chia cho</legend>
                <div className="chips">
                  {people.map((p) => (
                    <button type="button" key={p.id} className="chip" aria-pressed={splitIds.includes(p.id)} onClick={() => toggle(p.id)}>
                      {nameOf(p.id)}
                    </button>
                  ))}
                </div>
                {value > 0 && splitIds.length > 0 && (
                  <p className="help">Mỗi người khoảng {formatVnd(Math.round(value / splitIds.length))}.</p>
                )}
              </fieldset>
            </>
          )}
          <div className="row">
            <button type="submit" className="btn-pill btn-dark" disabled={busy || !value || !splitIds.length}>
              {busy ? 'Đang lưu…' : 'Lưu khoản chi'}
            </button>
            <button type="button" className="btn-pill btn-outline" onClick={() => setForm(null)}>Huỷ</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-pill btn-outline" onClick={() => openForm(null)}>
          <Icon name="plus" size={18} strokeWidth={2.2} />
          {'Thêm khoản chi'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// Thành viên chuyến nhóm: chủ mời bạn bè vào, xoá thành viên; thành viên chỉ xem danh sách
function Members({ trip, userId, busy, run, onChanged }) {
  const [friends, setFriends] = useState([]);
  const [pick, setPick] = useState('');
  const isOwner = trip.user_id === userId;

  useEffect(() => {
    if (!isOwner) return;
    api.listFriendships(userId)
      .then((list) => setFriends(list.filter((f) => f.status === 'accepted').map((f) => f.profile)))
      .catch(() => {});
  }, [isOwner, userId]);

  const memberIds = new Set(trip.members.map((m) => m.profile.id));
  const candidates = friends.filter((f) => !memberIds.has(f.id));

  if (!isOwner && trip.members.length === 0) return null;

  return (
    <section className="stack-sm">
      <h2 className="section-title">Thành viên</h2>
      {isOwner && trip.members.length === 0 && (
        <p className="help">
          Mời bạn bè vào chuyến để cùng ghi. Mỗi người tự chọn nơi, lộ trình của mình để chia sẻ với nhóm.
        </p>
      )}
      <ul className="track-list friend-list">
        {!isOwner && trip.owner && (
          <li><span className="track-main"><span className="track-name">{trip.owner.display_name}</span><span className="muted-sm">chủ chuyến</span></span></li>
        )}
        {trip.members.map(({ profile }) => (
          <li key={profile.id}>
            <span className="track-main">
              <span className="track-name">{profile.id === userId ? 'Bạn' : profile.display_name}</span>
              {profile.username && <span className="muted-sm">@{profile.username}</span>}
            </span>
            {isOwner && (
              <button
                type="button"
                className="round-btn plain"
                disabled={busy}
                onClick={() =>
                  window.confirm(`Xoá ${profile.display_name} khỏi chuyến?`) &&
                  run(async () => { await api.removeTripMember(trip.id, profile.id); await onChanged(); })}
                aria-label={`Xoá ${profile.display_name} khỏi chuyến`}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && candidates.length > 0 && (
        <div className="search-row">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Chọn bạn để mời vào chuyến">
            <option value="">Chọn bạn bè…</option>
            {candidates.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}
          </select>
          <button
            type="button"
            className="btn"
            disabled={busy || !pick}
            onClick={() => run(async () => { await api.addTripMember(trip.id, pick); setPick(''); await onChanged(); })}
          >
            Mời
          </button>
        </div>
      )}
      {isOwner && friends.length === 0 && (
        <p className="help">Kết bạn ở tab Tôi để mời vào chuyến.</p>
      )}
    </section>
  );
}

function TripForm({ trip, onCancel, onSaved, onDeleted }) {
  const [name, setName] = useState(trip?.name ?? '');
  const [start, setStart] = useState(trip?.start_date ?? todayStr());
  const [end, setEnd] = useState(trip?.end_date ?? todayStr());
  const [note, setNote] = useState(trip?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (end < start) {
      setError('Ngày về phải sau hoặc bằng ngày đi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = { name: name.trim(), start_date: start, end_date: end, note: note.trim() || null };
      onSaved(trip ? await api.updateTrip(trip.id, fields) : await api.createTrip(fields));
    } catch (err) {
      setError(`Chưa lưu được: ${err.message}`);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Xoá chuyến "${trip.name}"? Địa điểm và lộ trình vẫn được giữ.`)) return;
    setBusy(true);
    try {
      await api.deleteTrip(trip.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <form className="screen-inner stack" onSubmit={submit}>
        <div className="row trip-actions">
          <button type="button" className="round-btn" onClick={onCancel} aria-label="Huỷ">
            <Icon name="back" size={20} strokeWidth={2} />
          </button>
        </div>
        <h1 className="screen-title">{trip ? 'Sửa chuyến đi' : 'Chuyến đi mới'}</h1>

        <label className="field">
          <span>Tên chuyến</span>
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hội An mùa thu" />
        </label>
        <div className="date-range">
          <label><span>Ngày đi</span><input type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label><span>Ngày về</span><input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <p className="help">Nơi đã đến và lộ trình trong khoảng ngày này tự thuộc về chuyến.</p>
        <label className="field">
          <span>Ghi chú</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu chuyến đi'}</button>
        {trip && (
          <button type="button" className="btn-link danger" onClick={remove} disabled={busy}>Xoá chuyến đi</button>
        )}
      </form>
    </div>
  );
}
