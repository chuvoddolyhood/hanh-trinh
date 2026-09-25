import { useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { readPhotoMeta } from '../lib/photo';
import { searchPlaces, reverseGeocode } from '../lib/geocode';
import { fetchDailyWeather } from '../lib/weather';
import { todayStr, toDateStr } from '../lib/dates';
import { parseTags } from '../lib/text';
import { locateByTime } from '../lib/geo';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { MOODS } from './moods';

const VISIBILITY = [
  { id: 'private', label: 'Chỉ mình tôi' },
  { id: 'friends', label: 'Bạn bè' },
];

/**
 * Tạo check-in mới, hoặc sửa check-in cũ khi có prop place. Vị trí lấy theo thứ tự ưu tiên:
 * chạm bản đồ / chọn kết quả tìm kiếm / GPS trong ảnh.
 */
export default function CheckinForm({ userId, place = null, tracks = [], defaultVisibility = 'private', draft, onDraftChange, onFocus, onSaved }) {
  const [kind, setKind] = useState(place?.kind ?? 'visited');
  const [name, setName] = useState(place?.name ?? '');
  const [date, setDate] = useState(place?.visited_at ?? todayStr());
  const [mood, setMood] = useState(place?.mood ?? '');
  const [note, setNote] = useState(place?.note ?? '');
  const [tagsText, setTagsText] = useState(place?.tags.join(', ') ?? '');
  const [visibility, setVisibility] = useState(place?.visibility ?? defaultVisibility);
  const [tripId, setTripId] = useState(place?.trip_id ?? '');
  const [groupTrips, setGroupTrips] = useState(null); // null: đang tải
  const [photos, setPhotos] = useState([]); // Ảnh mới: [{ id, file, gps, takenAt, preview }]
  const [removedIds, setRemovedIds] = useState([]); // Ảnh cũ bị bỏ khi sửa
  const oldPhotos = place?.photos ?? [];
  const oldUrls = usePhotoUrls(oldPhotos.map((p) => p.storage_path));

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState(null);

  // Người dùng đã tự gõ tên (hoặc đang sửa check-in cũ) thì không ghi đè bằng tên gợi ý
  const nameTouchedRef = useRef(Boolean(place));

  // Ghim thay đổi → gợi ý tên từ reverse geocoding
  useEffect(() => {
    if (!draft || nameTouchedRef.current) return undefined;
    const ctrl = new AbortController();
    reverseGeocode(draft.lat, draft.lng, ctrl.signal)
      .then((suggested) => {
        if (suggested && !nameTouchedRef.current) setName(suggested);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [draft]);

  // Chuyến nhóm mình đang ở (của mình có thành viên, hoặc của người khác) để chọn chia sẻ nơi này
  useEffect(() => {
    api.listTrips()
      .then((list) => setGroupTrips(list.filter((t) => t.user_id !== userId || t.members.length > 0)))
      .catch(() => {});
  }, [userId]);
  const tripChoices = (groupTrips ?? []).filter((t) => kind === 'visited' && date >= t.start_date && date <= t.end_date);

  // Giải phóng URL xem trước khi rời form
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const found = await searchPlaces(query.trim());
      setResults(found);
      if (found.length === 0) setHint('Không tìm thấy. Thử tên ngắn hơn hoặc thêm tên tỉnh, thành.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r) {
    nameTouchedRef.current = true; // Tên từ kết quả tìm kiếm đã chính xác
    setName(r.name);
    onDraftChange({ lat: r.lat, lng: r.lng });
    onFocus({ lng: r.lng, lat: r.lat, zoom: 16 });
    setResults([]);
    setHint('');
  }

  async function handlePhotos(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // Cho phép chọn lại cùng file
    if (!files.length) return;

    const metas = await Promise.all(
      files.map(async (file) => {
        const meta = await readPhotoMeta(file);
        // Ảnh không có GPS nhưng có giờ chụp → lấy vị trí trên lộ trình đã ghi lúc đó
        const fromTrack = !meta.gps && meta.takenAt ? locateByTime(tracks, meta.takenAt.getTime()) : null;
        return {
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
          ...meta,
          gps: meta.gps ?? fromTrack,
          fromTrack: Boolean(fromTrack),
        };
      }),
    );
    setPhotos((prev) => [...prev, ...metas]);

    // Chưa có ghim → dùng GPS của ảnh đầu tiên có toạ độ
    const withGps = metas.find((m) => m.gps);
    if (withGps && !draft) {
      onDraftChange(withGps.gps);
      onFocus({ ...withGps.gps, zoom: 16 });
    }
    // Lấy ngày chụp sớm nhất làm ngày đến (khi sửa thì giữ ngày đã lưu)
    const dates = metas.map((m) => m.takenAt).filter(Boolean).sort((a, b) => a - b);
    if (dates.length && !place) setDate(toDateStr(dates[0]));

    const gpsCount = metas.filter((m) => m.gps && !m.fromTrack).length;
    const trackCount = metas.filter((m) => m.fromTrack).length;
    setHint(
      gpsCount + trackCount > 0
        ? [
          gpsCount > 0 && `${gpsCount}/${metas.length} ảnh có vị trí GPS.`,
          trackCount > 0 && `${trackCount}/${metas.length} ảnh được lấy vị trí từ lộ trình theo giờ chụp.`,
        ].filter(Boolean).join(' ')
        : 'Ảnh không có vị trí GPS (thường do ảnh tải từ Zalo, Facebook). Hãy chạm bản đồ để chọn vị trí.',
    );
  }

  function removePhoto(id) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!draft) {
      setError('Chưa có vị trí. Chạm lên bản đồ, tìm địa điểm hoặc thêm ảnh có GPS.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const visitedAt = kind === 'visited' ? date : null;

      // Thời tiết chỉ là thông tin phụ: lỗi mạng không chặn việc lưu
      // Khi sửa mà không đổi ngày và vị trí thì giữ thời tiết cũ
      const sameWeather =
        place?.weather && place.visited_at === visitedAt && place.lat === draft.lat && place.lng === draft.lng;
      let weather = null;
      if (sameWeather) weather = place.weather;
      else if (visitedAt) {
        setProgress('Đang lấy thời tiết…');
        weather = await fetchDailyWeather(draft.lat, draft.lng, visitedAt).catch(() => null);
      }

      // Chỉ gắn khi ngày đến nằm trong chuyến (đổi ngày ra ngoài thì gỡ); chưa tải xong danh sách chuyến → giữ nguyên
      let nextTripId = place?.trip_id ?? null;
      if (groupTrips !== null) nextTripId = tripChoices.some((t) => t.id === tripId) ? tripId : null;

      const save = place ? api.updatePlace : api.createPlace;
      const saved = await save(
        {
          userId,
          ...(place && { id: place.id, removed: oldPhotos.filter((p) => removedIds.includes(p.id)) }),
          kind,
          name: name.trim(),
          lat: draft.lat,
          lng: draft.lng,
          visited_at: visitedAt,
          mood: kind === 'visited' ? mood || null : null,
          note: note.trim() || null,
          tags: parseTags(tagsText),
          visibility,
          trip_id: nextTripId,
          weather,
          photos,
        },
        (i, total) => setProgress(`Đang tải ảnh ${i}/${total}…`),
      );
      onSaved(saved);
    } catch (err) {
      setError(`Chưa lưu được: ${err.message}`);
    } finally {
      setSaving(false);
      setProgress('');
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="segmented" role="radiogroup" aria-label="Loại check-in">
        <button type="button" role="radio" aria-checked={kind === 'visited'} onClick={() => setKind('visited')}>
          Đã đến
        </button>
        <button type="button" role="radio" aria-checked={kind === 'wishlist'} onClick={() => setKind('wishlist')}>
          Muốn đến
        </button>
      </div>

      {/* Vị trí */}
      <fieldset className="stack-sm">
        <legend>Vị trí</legend>
        <p className="help">
          {draft
            ? `Đã ghim ${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}. Kéo ghim trên bản đồ để chỉnh.`
            : 'Chạm lên bản đồ để ghim, hoặc tìm theo tên.'}
        </p>
        <div className="search-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(e); }}
            placeholder="VD: Hồ Hoàn Kiếm"
            aria-label="Tìm địa điểm"
          />
          <button type="button" className="btn" onClick={handleSearch} disabled={searching}>
            {searching ? 'Đang tìm…' : 'Tìm'}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="results">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pickResult(r)}>
                  <strong>{r.name}</strong>
                  <span>{r.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label className="field">
        <span>Tên địa điểm</span>
        <input
          required
          maxLength={200}
          value={name}
          onChange={(e) => { nameTouchedRef.current = true; setName(e.target.value); }}
        />
      </label>

      {kind === 'visited' && (
        <>
          <label className="field">
            <span>Ngày đến</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <fieldset>
            <legend>Cảm xúc</legend>
            <div className="moods">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={mood === m.id}
                  onClick={() => setMood(mood === m.id ? '' : m.id)}
                >
                  <span aria-hidden="true">{m.emoji}</span> {m.label}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <label className="field">
        <span>Ghi chú</span>
        <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <label className="field">
        <span>Tag (cách nhau bằng dấu phẩy)</span>
        <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="biển, cà phê, gia đình" />
      </label>

      <fieldset>
        <legend>Ai xem được</legend>
        <div className="segmented" role="radiogroup" aria-label="Ai xem được">
          {VISIBILITY.map((v) => (
            <button type="button" key={v.id} role="radio" aria-checked={visibility === v.id} onClick={() => setVisibility(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </fieldset>

      {tripChoices.length > 0 && (
        <label className="field">
          <span>Chia sẻ vào chuyến nhóm</span>
          <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">Không</option>
            {tripChoices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}

      {/* Ảnh */}
      <fieldset className="stack-sm">
        <legend>Ảnh</legend>
        <label className="btn file-btn">
          {'Thêm ảnh'}
          <input type="file" accept="image/*" multiple onChange={handlePhotos} hidden />
        </label>
        {(photos.length > 0 || oldPhotos.length > removedIds.length) && (
          <ul className="thumbs">
            {oldPhotos.filter((p) => !removedIds.includes(p.id)).map((p) => (
              <li key={p.id}>
                <img src={oldUrls[p.storage_path]} alt="" />
                <button type="button" onClick={() => setRemovedIds((ids) => [...ids, p.id])} aria-label="Xoá ảnh này">×</button>
              </li>
            ))}
            {photos.map((p) => (
              <li key={p.id}>
                {/* HEIC có thể không xem trước được trên Chrome nhưng vẫn upload được sau khi nén */}
                <img src={p.preview} alt="" />
                {p.gps && (
                  <span className="thumb-gps" title={p.fromTrack ? 'Vị trí lấy từ lộ trình' : 'Ảnh có GPS'}>
                    {p.fromTrack ? 'LT' : 'GPS'}
                  </span>
                )}
                <button type="button" onClick={() => removePhoto(p.id)} aria-label="Bỏ ảnh này">×</button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {hint && <p className="help">{hint}</p>}
      {error && <p className="error">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving && (progress || 'Đang lưu…')}
        {!saving && place && 'Lưu thay đổi'}
        {!saving && !place && (kind === 'visited' ? 'Lưu check-in' : 'Thêm vào danh sách muốn đến')}
      </button>
    </form>
  );
}
