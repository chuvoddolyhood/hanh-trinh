import { useEffect, useState } from 'react';
import * as api from '../lib/api';

// Signed URL đã lấy, dùng chung mọi màn hình: { [path]: { url, exp } }. Cùng URL → trình duyệt dùng lại ảnh trong cache.
// Signed URL sống 1 giờ (api.getPhotoUrls); bỏ trước 5 phút để ảnh đang tải không hết hạn giữa chừng.
const cache = {};
const TTL_MS = 55 * 60 * 1000;

function cached(paths) {
  const now = Date.now();
  const out = {};
  for (const p of paths) if (cache[p]?.exp > now) out[p] = cache[p].url;
  return out;
}

// Lấy signed URL cho danh sách đường dẫn ảnh (chỉ xin những ảnh chưa có, gộp 1 request). Trả về { [path]: url }
export function usePhotoUrls(paths) {
  const key = paths.join('|');
  const [urls, setUrls] = useState(() => cached(paths));

  useEffect(() => {
    if (!key) return undefined;
    const all = key.split('|');
    const known = cached(all);
    setUrls(known);
    const missing = all.filter((p) => !known[p]);
    if (!missing.length) return undefined;
    let alive = true;
    api.getPhotoUrls(missing)
      .then((map) => {
        const exp = Date.now() + TTL_MS;
        for (const [p, url] of Object.entries(map)) cache[p] = { url, exp };
        if (alive) setUrls(cached(all));
      })
      .catch(() => {}); // Ảnh lỗi thì hiện khung trống, không chặn giao diện
    return () => { alive = false; };
  }, [key]);

  return urls;
}
