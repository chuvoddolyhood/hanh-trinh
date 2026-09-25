import { useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { readPhotoMeta } from '../lib/photo';
import { reverseGeocode } from '../lib/geocode';
import { fetchDailyWeather } from '../lib/weather';
import { locateByTime } from '../lib/geo';
import { formatDate } from '../lib/dates';
import { groupPhotos, findExisting } from '../lib/photoImport';

/**
 * Tab Tôi: chọn nhiều ảnh cũ → gom theo vị trí và ngày chụp thành các nơi đã đến → xem trước → lưu.
 * Nhóm trùng nơi đã có (cùng ngày, gần) thì thêm ảnh vào nơi đó. Tên nơi lấy từ Nominatim, lần lượt 1 nơi/giây.
 */
export default function PhotoImport({ userId, places, tracks, defaultVisibility, onChanged }) {
  const [groups, setGroups] = useState(null); // [{ id, date, lat, lng, photos, name, on, existing }]
  const [skipped, setSkipped] = useState(0);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const previews = useRef([]); // Object URL xem trước, giải phóng khi xong
  const naming = useRef(null); // AbortController của lượt lấy tên

  const clear = () => {
    naming.current?.abort();
    previews.current.forEach(URL.revokeObjectURL);
    previews.current = [];
  };
  useEffect(() => clear, []);

  async function pick(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    clear();
    setGroups(null);
    setBusy(true);
    const metas = [];
    for (let i = 0; i < files.length; i++) {
      setStatus(`Đang đọc ảnh ${i + 1}/${files.length}…`);
      const file = files[i];
      const meta = await readPhotoMeta(file);
      // Không có giờ chụp → ngày sửa file; không có GPS → vị trí trên lộ trình đã ghi lúc chụp
      const takenAt = meta.takenAt ?? new Date(file.lastModified);
      const gps = meta.gps ?? locateByTime(tracks, takenAt.getTime());
      metas.push({ id: crypto.randomUUID(), file, gps, takenAt });
    }
    const found = groupPhotos(metas).map((g, i) => {
      const existing = findExisting(g, places);
      const cover = URL.createObjectURL(g.photos[0].file);
      previews.current.push(cover);
      return { ...g, cover, existing, name: existing?.name ?? `Nơi ${i + 1}`, named: Boolean(existing), on: true };
    });
    setSkipped(metas.length - found.reduce((s, g) => s + g.photos.length, 0));
    setGroups(found);
    setBusy(false);
    setStatus(null);
    nameGroups(found);
  }

  // Lấy tên cho các nhóm mới, lần lượt (geocode.js tự giãn 1 giây/lần); người dùng sửa tên rồi thì giữ
  async function nameGroups(list) {
    const ctrl = new AbortController();
    naming.current = ctrl;
    for (const g of list.filter((x) => !x.named)) {
      const name = await reverseGeocode(g.lat, g.lng, ctrl.signal).catch(() => null);
      if (ctrl.signal.aborted) return;
      if (name) setGroups((gs) => gs.map((x) => (x.id === g.id && !x.named ? { ...x, name, named: true } : x)));
    }
  }

  const update = (id, fields) => setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...fields } : g)));
  const chosen = (groups ?? []).filter((g) => g.on);
  const photoCount = chosen.reduce((s, g) => s + g.photos.length, 0);

  async function save() {
    naming.current?.abort();
    setBusy(true);
    let done = 0;
    try {
      for (const g of chosen) {
        setStatus(`Đang lưu nơi ${done + 1}/${chosen.length}…`);
        const photos = g.photos.map(({ id, file, gps, takenAt }) => ({ id, file, gps, takenAt }));
        if (g.existing) {
          await api.addPhotos(userId, g.existing.id, photos);
        } else {
          const weather = await fetchDailyWeather(g.lat, g.lng, g.date).catch(() => null);
          await api.createPlace({
            id: crypto.randomUUID(),
            userId,
            kind: 'visited',
            name: g.name.trim() || `Nơi ngày ${formatDate(g.date)}`,
            lat: g.lat,
            lng: g.lng,
            visited_at: g.date,
            tags: [],
            visibility: defaultVisibility,
            weather,
            photos,
          });
        }
        done += 1;
        update(g.id, { on: false, saved: true });
      }
      setStatus(`Đã lưu ${done} nơi, ${photoCount} ảnh.`);
      clear();
      setGroups(null);
    } catch (e) {
      setStatus(`Đã lưu ${done}/${chosen.length} nơi, dừng vì lỗi: ${e.message}. Bấm Lưu để thử tiếp.`);
    } finally {
      setBusy(false);
      if (done) onChanged();
    }
  }

  return (
    <section className="stack-sm">
      <h2 className="section-title">Nhập ảnh từ album</h2>
      <p className="help">
        Chọn nhiều ảnh cũ: ảnh có vị trí được gom theo nơi và ngày chụp thành các check-in. Xem lại trước khi lưu.
      </p>
      <label className={`btn-pill btn-outline file-btn${busy ? ' is-busy' : ''}`}>
        {busy ? 'Đang xử lý…' : 'Chọn ảnh'}
        <input type="file" accept="image/*" multiple onChange={pick} hidden disabled={busy} />
      </label>
      {status && <p className="notice" role="status">{status}</p>}

      {groups && (
        <>
          <p className="help">
            {groups.length} nơi từ {groups.reduce((s, g) => s + g.photos.length, 0)} ảnh
            {skipped > 0 && `; ${skipped} ảnh không có vị trí nên bỏ qua`}.
          </p>
          <ul className="import-list">
            {groups.map((g) => (
              <li key={g.id} className={g.on ? '' : 'is-off'}>
                <img src={g.cover} alt="" />
                <span className="import-body">
                  <input
                    value={g.name}
                    maxLength={200}
                    onChange={(e) => update(g.id, { name: e.target.value, named: true })}
                    disabled={Boolean(g.existing) || g.saved}
                    aria-label="Tên nơi"
                  />
                  <span className="muted-sm">
                    {formatDate(g.date)}, {g.photos.length} ảnh
                    {g.existing && ', thêm vào nơi đã có'}
                    {g.saved && ', đã lưu'}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={g.on}
                  disabled={g.saved || busy}
                  onChange={(e) => update(g.id, { on: e.target.checked })}
                  aria-label={`Lưu ${g.name}`}
                />
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="btn-pill btn-dark" onClick={save} disabled={busy || !chosen.length}>
              Lưu {chosen.length} nơi ({photoCount} ảnh)
            </button>
            <button
              type="button"
              className="btn-pill btn-outline"
              onClick={() => {
                clear();
                setGroups(null);
              }}
              disabled={busy}
            >
              Huỷ
            </button>
          </div>
        </>
      )}
    </section>
  );
}
