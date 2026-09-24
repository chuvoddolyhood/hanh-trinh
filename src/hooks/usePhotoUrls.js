import { useEffect, useState } from 'react';
import * as api from '../lib/api';

// Lấy signed URL cho danh sách đường dẫn ảnh (gộp 1 request). Trả về { [path]: url }
export function usePhotoUrls(paths) {
  const [urls, setUrls] = useState({});
  const key = paths.join('|');

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    api.getPhotoUrls(key.split('|'))
      .then((map) => alive && setUrls(map))
      .catch(() => {}); // Ảnh lỗi thì hiện khung trống, không chặn giao diện
    return () => { alive = false; };
  }, [key]);

  return urls;
}
