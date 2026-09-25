import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { supabase } from "../lib/supabase";
import { parseGpxFile } from "../lib/gpx";
import { bounds, formatDistance, formatDuration } from "../lib/geo";
import { formatDate, toDateStr, todayStr } from "../lib/dates";
import { placesToGeoJson, tracksToGpx, downloadText } from "../lib/backup";
import { clearOutbox } from "../lib/outbox";
import { recapYears } from "../lib/recap";
import { badges } from "../lib/badges";
import { trackElevation } from "../lib/elevation";
import Icon from "./icons";
import FriendsSection from "./FriendsSection";
import TimelineImport from "./TimelineImport";
import PhotoImport from "./PhotoImport";
import Leaderboard from "./Leaderboard";
import MemoriesPush from "./MemoriesPush";

const THEMES = [
  { id: "auto", label: "Tự động" },
  { id: "light", label: "Sáng" },
  { id: "dark", label: "Tối" },
];

const VISIBILITY = [
  { id: "private", label: "Chỉ mình tôi" },
  { id: "friends", label: "Bạn bè" },
];

const PROVINCE_SETS = [
  { id: "34", label: "34 tỉnh (từ 7/2025)" },
  { id: "63", label: "63 tỉnh (trước 7/2025)" },
];

// Tab Tôi: hồ sơ, bạn bè, cài đặt, lộ trình đã lưu, nhập GPX, đăng xuất
export default function MeScreen({
  email,
  theme,
  onThemeChange,
  goalKm,
  onGoalChange,
  streak,
  provinceSet,
  onProvinceSetChange,
  defaultVisibility,
  onDefaultVisibilityChange,
  userId,
  friendsRefresh,
  onViewFriend,
  onMakePoster,
  onOpenRecap,
  places,
  tracks,
  regions,
  pendingCount,
  onDiscardPending,
  onChanged,
  onShowTrack,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [password, setPassword] = useState("");
  const [pwMessage, setPwMessage] = useState(null);
  const [elevationId, setElevationId] = useState(null); // Lộ trình đang mở biểu đồ độ cao

  // Đặt/đổi mật khẩu (tài khoản tạo bằng link email chưa có mật khẩu)
  async function savePassword(e) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setPassword("");
    const errors = {
      same_password: "Mật khẩu mới trùng mật khẩu cũ.",
      weak_password: "Mật khẩu quá yếu. Dùng ít nhất 6 ký tự.",
    };
    setPwMessage(
      error ? (errors[error.code] ?? error.message) : "Đã lưu mật khẩu.",
    );
  }

  async function importGpx(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setMessage(null);
    try {
      let count = 0;
      for (const file of files) {
        for (const t of await parseGpxFile(file)) {
          await api.createTrack({ ...t, source: "gpx" });
          count += 1;
        }
      }
      setMessage(
        count
          ? `Đã nhập ${count} lộ trình.`
          : "File không chứa lộ trình nào có từ 2 điểm trở lên.",
      );
      onChanged();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTrack(t) {
    if (!window.confirm(`Xoá lộ trình "${t.name}"?`)) return;
    if (t.pending) {
      onDiscardPending(t.id);
      return;
    }
    try {
      await api.deleteTrack(t.id);
      onChanged();
    } catch (e) {
      setMessage(e.message);
    }
  }

  // Máy dùng chung: đăng xuất xoá cả mục chưa đồng bộ, nên hỏi trước
  async function signOut() {
    if (
      pendingCount > 0 &&
      !window.confirm(
        `Còn ${pendingCount} mục lưu lúc mất mạng chưa đồng bộ. Đăng xuất sẽ xoá chúng khỏi máy này. Vẫn đăng xuất?`,
      )
    )
      return;
    await clearOutbox().catch(() => {});
    supabase.auth.signOut();
  }

  const years = recapYears(places, tracks);
  const badgeList = badges(places, tracks, regions);
  const earned = badgeList.filter((b) => b.done).length;

  return (
    <div className="screen">
      <div className="screen-inner stack">
        <header className="screen-head">
          <span className="mono-label wide">TÀI KHOẢN</span>
          <h1 className="screen-title">Tôi</h1>
          <span className="screen-sub">{email}</span>
        </header>

        <FriendsSection
          userId={userId}
          onViewFriend={onViewFriend}
          refreshKey={friendsRefresh}
        />

        <Leaderboard userId={userId} />

        <section className="stack-sm">
          <h2 className="section-title">Giao diện</h2>
          <div className="chips">
            {THEMES.map((t) => (
              <button
                type="button"
                key={t.id}
                className="chip"
                aria-pressed={theme === t.id}
                onClick={() => onThemeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Check-in mới mặc định cho</h2>
          <div className="chips">
            {VISIBILITY.map((v) => (
              <button
                type="button"
                key={v.id}
                className="chip"
                aria-pressed={defaultVisibility === v.id}
                onClick={() => onDefaultVisibilityChange(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Đếm tỉnh, thành theo</h2>
          <div className="chips">
            {PROVINCE_SETS.map((s) => (
              <button
                type="button"
                key={s.id}
                className="chip"
                aria-pressed={provinceSet === s.id}
                onClick={() => onProvinceSetChange(s.id)}
              >
                {s.label}
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
            onChange={(e) =>
              Number(e.target.value) > 0 && onGoalChange(Number(e.target.value))
            }
          />
        </label>
        <p className="help">
          {streak > 0
            ? `Chuỗi hiện tại: ${streak} ngày liên tiếp đạt mục tiêu.`
            : "Đi đủ mục tiêu mỗi ngày để bắt đầu chuỗi."}
        </p>

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
          <button type="submit" className="btn-pill btn-outline">
            Lưu mật khẩu
          </button>
          {pwMessage && <p className="notice">{pwMessage}</p>}
        </form>

        <section className="stack-sm">
          <h2 className="section-title">Poster bản đồ</h2>
          <p className="help">Ảnh bản đồ các nơi đã đến và lộ trình, kèm số liệu, để lưu hoặc đăng lên mạng xã hội. Bật "Tỉnh đã đến" hoặc "Nơi đi nhiều" trên bản đồ trước nếu muốn in cả hai lớp đó.</p>
          <button type="button" className="btn-pill btn-outline" onClick={onMakePoster}>
            Tạo poster
          </button>
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Huy hiệu</h2>
          <p className="help">Đã đạt {earned}/{badgeList.length}.</p>
          <ul className="badges">
            {badgeList.map((b) => (
              <li key={b.id} className={b.done ? "badge is-done" : "badge"}>
                <span className="badge-name">{b.label}</span>
                <span className="muted-sm">{b.desc}</span>
                {b.done ? (
                  <span className="mono-label badge-state">ĐÃ ĐẠT</span>
                ) : (
                  <span
                    className="badge-bar"
                    role="progressbar"
                    aria-label={`${b.label}: ${b.value}/${b.goal}`}
                    aria-valuenow={b.value}
                    aria-valuemin={0}
                    aria-valuemax={b.goal}
                  >
                    <span style={{ width: `${(b.value / b.goal) * 100}%` }} />
                  </span>
                )}
                {!b.done && (
                  <span className="mono-label">
                    {b.value}/{b.goal}
                    {b.unit && ` ${b.unit.toUpperCase()}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {years.length > 0 && (
          <section className="stack-sm">
            <h2 className="section-title">Tổng kết năm</h2>
            <p className="help">Xem lại một năm: số nơi, tỉnh mới, quãng đường đi bộ, tháng đi nhiều nhất.</p>
            <div className="chips">
              {years.map((y) => (
                <button type="button" key={y} className="chip" onClick={() => onOpenRecap(y)}>
                  Năm {y}
                </button>
              ))}
            </div>
          </section>
        )}

        <MemoriesPush userId={userId} goalKm={goalKm} />

        <PrivacyZones />

        <section className="stack-sm">
          <h2 className="section-title">Lộ trình đã lưu</h2>
          {tracks.length === 0 && (
            <p className="empty">Chưa có lộ trình nào.</p>
          )}
          <ul className="track-list">
            {tracks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="track-main"
                  onClick={() => onShowTrack(bounds(t.points))}
                >
                  <span className="track-name">{t.name}</span>
                  {t.pending && (
                    <span className="muted-sm">
                      {t.pending.error ? `Chưa đồng bộ được: ${t.pending.error}` : "Chờ đồng bộ"}
                    </span>
                  )}
                  <span className="muted-sm">
                    {formatDistance(t.distance_m)}
                    {t.started_at &&
                      `, ${formatDate(toDateStr(new Date(t.started_at)))}`}
                    {t.started_at &&
                      t.ended_at &&
                      `, ${formatDuration(new Date(t.ended_at) - new Date(t.started_at))}`}
                  </span>
                </button>
                <button
                  type="button"
                  className="round-btn plain"
                  onClick={() => setElevationId(elevationId === t.id ? null : t.id)}
                  aria-expanded={elevationId === t.id}
                  aria-label={`Độ cao của ${t.name}`}
                >
                  <Icon name="down" size={18} />
                </button>
                <button
                  type="button"
                  className="round-btn plain"
                  onClick={() => removeTrack(t)}
                  aria-label={`Xoá ${t.name}`}
                >
                  <Icon name="close" size={18} />
                </button>
                {elevationId === t.id && <TrackElevation track={t} />}
              </li>
            ))}
          </ul>
        </section>

        <section className="stack-sm">
          <h2 className="section-title">Nhập từ ứng dụng khác</h2>
          <p className="help">
            Ghi lộ trình dài bằng ứng dụng chạy nền được (ví dụ OsmAnd), xuất
            file GPX rồi nhập vào đây.
          </p>
          <label
            className={`btn-pill btn-outline file-btn${busy ? " is-busy" : ""}`}
          >
            {busy ? "Đang nhập…" : "Chọn file GPX"}
            <input
              type="file"
              accept=".gpx,application/gpx+xml"
              multiple
              onChange={importGpx}
              hidden
              disabled={busy}
            />
          </label>
          {message && <p className="notice">{message}</p>}
        </section>

        <PhotoImport
          userId={userId}
          places={places}
          tracks={tracks}
          defaultVisibility={defaultVisibility}
          onChanged={onChanged}
        />

        <TimelineImport places={places} onChanged={onChanged} />

        <section className="stack-sm">
          <h2 className="section-title">Sao lưu dữ liệu</h2>
          <p className="help">
            Tải địa điểm (GeoJSON) và lộ trình (GPX) về máy, mở được bằng ứng dụng bản đồ khác. Chưa gồm ảnh.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn-pill btn-outline"
              disabled={!places.length}
              onClick={() =>
                downloadText(
                  JSON.stringify(placesToGeoJson(places), null, 2),
                  `hanh-trinh-dia-diem-${todayStr()}.geojson`,
                  "application/geo+json",
                )
              }
            >
              Địa điểm ({places.length})
            </button>
            <button
              type="button"
              className="btn-pill btn-outline"
              disabled={!tracks.length}
              onClick={() =>
                downloadText(
                  tracksToGpx(tracks),
                  `hanh-trinh-lo-trinh-${todayStr()}.gpx`,
                  "application/gpx+xml",
                )
              }
            >
              Lộ trình ({tracks.length})
            </button>
          </div>
        </section>

        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={signOut}
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

// Biểu đồ độ cao của một lộ trình (lấy khi mở, nhớ theo id lộ trình)
function TrackElevation({ track }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    trackElevation(track)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError("Không lấy được độ cao. Kiểm tra mạng rồi mở lại."));
    return () => {
      alive = false;
    };
  }, [track]);

  if (error) return <p className="elevation help">{error}</p>;
  if (!data) return <p className="elevation help">Đang lấy độ cao…</p>;

  // Vẽ trong khung 300×80, trục dọc từ thấp nhất đến cao nhất (tối thiểu 10 m để đường phẳng không bị phóng đại)
  const { profile, gain, loss, min, max } = data;
  const total = profile.at(-1)[0] || 1;
  const span = Math.max(max - min, 10);
  const xy = profile.map(([d, e]) => `${((d / total) * 300).toFixed(1)},${(76 - ((e - min) / span) * 70).toFixed(1)}`);
  return (
    <div className="elevation">
      <svg
        viewBox="0 0 300 80"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Độ cao từ ${Math.round(min)} đến ${Math.round(max)} m`}
      >
        <polygon points={`0,80 ${xy.join(" ")} 300,80`} className="elevation-area" />
        <polyline points={xy.join(" ")} className="elevation-line" />
      </svg>
      <dl className="stat-row stat-row-text">
        <div><dt>LEO</dt><dd>{gain} m</dd></div>
        <div><dt>XUỐNG</dt><dd>{loss} m</dd></div>
        <div><dt>CAO NHẤT</dt><dd>{Math.round(max)} m</dd></div>
      </dl>
      <small className="muted-sm">Độ cao: Copernicus DEM GLO-90 qua Open-Meteo, ô lưới 90 m</small>
    </div>
  );
}

const RADII = [200, 500, 1000];
const radiusLabel = (m) => (m < 1000 ? `${m} m` : `${m / 1000} km`);

// Vùng riêng tư: khi chia sẻ chuyến đi, nơi và đoạn lộ trình trong vùng bị ẩn (xử lý ở server)
function PrivacyZones() {
  const [zones, setZones] = useState([]);
  const [name, setName] = useState("Nhà");
  const [radius, setRadius] = useState(500);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () =>
    api
      .listZones()
      .then(setZones)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    load();
  }, []);

  function addHere() {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt không hỗ trợ định vị.");
      return;
    }
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await api.createZone({
            name: name.trim() || "Nhà",
            lat: coords.latitude,
            lng: coords.longitude,
            radius_m: radius,
          });
          await load();
          setMessage("Đã thêm vùng riêng tư.");
        } catch (e) {
          setMessage(e.message);
        } finally {
          setBusy(false);
        }
      },
      () => {
        setMessage(
          "Không lấy được vị trí. Hãy cho phép truy cập vị trí rồi thử lại.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function remove(z) {
    if (!window.confirm(`Xoá vùng riêng tư "${z.name}"?`)) return;
    try {
      await api.deleteZone(z.id);
      load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <section className="stack-sm">
      <h2 className="section-title">Vùng riêng tư</h2>
      <p className="help">
        Khi chia sẻ chuyến đi, các nơi và đoạn lộ trình nằm trong vùng này được
        ẩn. Đứng tại nơi cần giấu (ví dụ nhà) rồi bấm thêm.
      </p>
      {zones.length > 0 && (
        <ul className="track-list">
          {zones.map((z) => (
            <li key={z.id}>
              <span className="track-main">
                <span className="track-name">{z.name}</span>
                <span className="muted-sm">
                  bán kính {radiusLabel(z.radius_m)}
                </span>
              </span>
              <button
                type="button"
                className="round-btn plain"
                onClick={() => remove(z)}
                aria-label={`Xoá vùng ${z.name}`}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="date-range">
        <label>
          <span>Tên vùng</span>
          <input
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          <span>Bán kính</span>
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                {radiusLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="btn-pill btn-outline"
        onClick={addHere}
        disabled={busy}
      >
        {busy ? "Đang lấy vị trí…" : "Thêm vùng tại vị trí hiện tại"}
      </button>
      {message && <p className="notice">{message}</p>}
    </section>
  );
}
