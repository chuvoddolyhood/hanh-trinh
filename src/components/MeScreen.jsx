import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { supabase } from "../lib/supabase";
import { parseGpxFile } from "../lib/gpx";
import { bounds, formatDistance, formatDuration } from "../lib/geo";
import { formatDate, toDateStr } from "../lib/dates";
import Icon from "./icons";
import FriendsSection from "./FriendsSection";
import TimelineImport from "./TimelineImport";
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
  provinceSet,
  onProvinceSetChange,
  defaultVisibility,
  onDefaultVisibilityChange,
  userId,
  friendsRefresh,
  onViewFriend,
  onMakePoster,
  places,
  tracks,
  onChanged,
  onShowTrack,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [password, setPassword] = useState("");
  const [pwMessage, setPwMessage] = useState(null);

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

        <FriendsSection
          userId={userId}
          onViewFriend={onViewFriend}
          refreshKey={friendsRefresh}
        />

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

        <MemoriesPush />

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
                  onClick={() => removeTrack(t)}
                  aria-label={`Xoá ${t.name}`}
                >
                  <Icon name="close" size={18} />
                </button>
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

        <TimelineImport places={places} onChanged={onChanged} />

        <button
          type="button"
          className="btn-pill btn-outline"
          onClick={() => supabase.auth.signOut()}
        >
          Đăng xuất
        </button>
      </div>
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
