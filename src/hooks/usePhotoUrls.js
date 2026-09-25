import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { thumbPath } from '../lib/photo';

// Signed URL đã lấy, dùng chung mọi màn hình: { [path]: { url, exp } }. Cùng URL → trình duyệt dùng lại ảnh trong cache.
// Signed URL sống 1 giờ (api.getPhotoUrls); bỏ trước 5 phút để ảnh đang tải không hết hạn giữa chừng.
const cache = {};
const TTL_MS = 55 * 60 * 1000;

const fresh = (key) => (cache[key]?.exp > Date.now() ? cache[key].url : undefined);

function store(map) {
  const exp = Date.now() + TTL_MS;
  for (const [key, url] of Object.entries(map)) cache[key] = { url, exp };
}

/**
 * Lấy signed URL cho danh sách đường dẫn ảnh gốc (chỉ xin những ảnh chưa có, gộp request). Trả về { [path]: url }.
 * thumb: dùng ảnh nhỏ <uuid>_t.jpg; ảnh upload trước khi có ảnh nhỏ thì dùng ảnh gốc.
 */
export function usePhotoUrls(paths, { thumb = false } = {}) {
  const keyOf = thumb ? thumbPath : (p) => p;
  const pick = (all) => Object.fromEntries(all.filter((p) => fresh(keyOf(p))).map((p) => [p, fresh(keyOf(p))]));
  const key = paths.join('|');
  const [urls, setUrls] = useState(() => pick(paths));

  useEffect(() => {
    if (!key) return undefined;
    const all = key.split('|');
    setUrls(pick(all));
    const missing = all.filter((p) => !fresh(keyOf(p)));
    if (!missing.length) return undefined;
    let alive = true;
    (async () => {
      const map = await api.getPhotoUrls(missing.map(keyOf));
      store(map);
      // Chưa có ảnh nhỏ → ảnh gốc, ghi vào cả khoá ảnh nhỏ để lần sau không xin lại
      const noThumb = thumb ? missing.filter((p) => !map[thumbPath(p)]) : [];
      if (noThumb.length) {
        const need = noThumb.filter((p) => !fresh(p));
        if (need.length) store(await api.getPhotoUrls(need));
        store(Object.fromEntries(noThumb.filter((p) => fresh(p)).map((p) => [thumbPath(p), fresh(p)])));
      }
      if (alive) setUrls(pick(all));
    })().catch(() => {}); // Ảnh lỗi thì hiện khung trống, không chặn giao diện
    return () => { alive = false; };
    // keyOf, pick chỉ phụ thuộc thumb
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, thumb]);

  return urls;
}
