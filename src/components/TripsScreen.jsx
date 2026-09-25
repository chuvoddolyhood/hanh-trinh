import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';
import { bounds, formatDistance } from '../lib/geo';
import { formatDate, todayStr } from '../lib/dates';

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
export default function TripsScreen({ userId, places, tracks, onOpenPlace, onShowOnMap, onDataChanged, onPlayStory, onMakePoster }) {
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

function TripDetail({ trip, userId, own, onBack, onEdit, onChanged, onLeft, onOpenPlace, onShowOnMap, onPlayStory, onMakePoster }) {
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
