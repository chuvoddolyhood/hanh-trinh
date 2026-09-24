import { useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { readPhotoMeta } from '../lib/photo';
import { searchPlaces, reverseGeocode } from '../lib/geocode';
import { fetchDailyWeather } from '../lib/weather';
import { todayStr, toDateStr } from '../lib/dates';
import { parseTags } from '../lib/text';
import { MOODS } from './moods';

/**
 * Tạo check-in mới. Vị trí lấy theo thứ tự ưu tiên:
 * chạm bản đồ / chọn kết quả tìm kiếm / GPS trong ảnh.
 */
export default function CheckinForm({ userId, draft, onDraftChange, onFocus, onSaved }) {
  const [kind, setKind] = useState('visited');
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayStr());
  const [mood, setMood] = useState('');
  const [note, setNote] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [photos, setPhotos] = useState([]); // [{ id, file, gps, takenAt, preview }]

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState(null);

  // Người dùng đã tự gõ tên thì không ghi đè bằng tên gợi ý
  const nameTouchedRef = useRef(false);

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
      files.map(async (file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        ...(await readPhotoMeta(file)),
      })),
    );
    setPhotos((prev) => [...prev, ...metas]);

    // Chưa có ghim → dùng GPS của ảnh đầu tiên có toạ độ
    const withGps = metas.find((m) => m.gps);
    if (withGps && !draft) {
      onDraftChange(withGps.gps);
      onFocus({ ...withGps.gps, zoom: 16 });
    }
    // Lấy ngày chụp sớm nhất làm ngày đến
    const dates = metas.map((m) => m.takenAt).filter(Boolean).sort((a, b) => a - b);
    if (dates.length) setDate(toDateStr(dates[0]));

    const gpsCount = metas.filter((m) => m.gps).length;
    setHint(
      gpsCount > 0
        ? `${gpsCount}/${metas.length} ảnh có vị trí GPS.`
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
      setProgress('Đang lấy thời tiết…');
      const weather = visitedAt
        ? await fetchDailyWeather(draft.lat, draft.lng, visitedAt).catch(() => null)
        : null;

      const place = await api.createPlace(
        {
          userId,
          kind,
          name: name.trim(),
          lat: draft.lat,
          lng: draft.lng,
          visited_at: visitedAt,
          mood: kind === 'visited' ? mood || null : null,
          note: note.trim() || null,
          tags: parseTags(tagsText),
          weather,
          photos,
        },
        (i, total) => setProgress(`Đang tải ảnh ${i}/${total}…`),
      );
      onSaved(place);
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

      {/* Ảnh */}
      <fieldset className="stack-sm">
        <legend>Ảnh</legend>
        <label className="btn file-btn">
          Thêm ảnh
          <input type="file" accept="image/*" multiple onChange={handlePhotos} hidden />
        </label>
        {photos.length > 0 && (
          <ul className="thumbs">
            {photos.map((p) => (
              <li key={p.id}>
                {/* HEIC có thể không xem trước được trên Chrome nhưng vẫn upload được sau khi nén */}
                <img src={p.preview} alt="" />
                {p.gps && <span className="thumb-gps" title="Ảnh có GPS">GPS</span>}
                <button type="button" onClick={() => removePhoto(p.id)} aria-label="Bỏ ảnh này">×</button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {hint && <p className="help">{hint}</p>}
      {error && <p className="error">{error}</p>}

      <button className="btn btn-primary" disabled={saving}>
        {saving ? progress || 'Đang lưu…' : kind === 'visited' ? 'Lưu check-in' : 'Thêm vào danh sách muốn đến'}
      </button>
    </form>
  );
}
