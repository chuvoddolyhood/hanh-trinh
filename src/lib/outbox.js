// Hàng chờ khi mất mạng: check-in mới và lộ trình được giữ trong IndexedDB (lưu được cả File ảnh),
// có mạng lại thì gửi lên. Mục có id tạo sẵn ở máy, nên gửi lại sau khi đứt mạng giữa chừng không tạo trùng.
// Mục: { id, userId, type: 'place' | 'track' | 'edit', data, createdAt, error? }
// 'edit': sửa check-in đã có (id = id địa điểm); data = { id, ...trường mới, photos: ảnh thêm, removed: ảnh cũ bỏ }
import * as api from './api';
import { fetchDailyWeather } from './weather';

const DB_NAME = 'hanh-trinh';
const STORE = 'outbox';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listOutbox(userId) {
  const items = await run('readonly', (s) => s.getAll());
  return items.filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export const enqueue = (userId, type, data) =>
  run('readwrite', (s) => s.put({ id: data.id, userId, type, data, createdAt: Date.now() }));

// Sửa nhiều lần khi còn mất mạng → gộp vào một mục: trường lấy bản mới nhất, ảnh thêm và ảnh bỏ cộng dồn
export async function enqueueEdit(userId, data) {
  const prev = await run('readonly', (s) => s.get(data.id));
  const merged =
    prev?.type === 'edit'
      ? {
          ...data,
          photos: [...prev.data.photos, ...data.photos],
          removed: [...new Map([...prev.data.removed, ...data.removed].map((r) => [r.id, r])).values()],
        }
      : data;
  return run('readwrite', (s) => s.put({ id: data.id, userId, type: 'edit', data: merged, createdAt: Date.now() }));
}

export const discardOutbox = (id) => run('readwrite', (s) => s.delete(id));

export const clearOutbox = () => run('readwrite', (s) => s.clear());

// Lỗi do mất mạng (Chrome: "Failed to fetch", Safari: "Load failed", Firefox: "NetworkError…")
export function isNetworkError(err) {
  return !navigator.onLine || /failed to fetch|load failed|networkerror/i.test(err?.message ?? '');
}

let syncing = null;

// Gửi lần lượt các mục đang chờ. Lỗi mạng → dừng, để lần sau; lỗi khác → ghi lại lỗi vào mục, chuyển mục tiếp.
// → số mục đã gửi xong. Gọi chồng nhau (sự kiện online + mở app) thì dùng chung một lượt.
export function syncOutbox(userId) {
  syncing ??= (async () => {
    let sent = 0;
    for (const item of await listOutbox(userId)) {
      try {
        if (item.type === 'track') {
          await api.createTrack(item.data);
        } else {
          const d = item.data;
          // Lúc lưu mất mạng nên chưa có thời tiết
          const weather =
            d.weather ?? (d.visited_at ? await fetchDailyWeather(d.lat, d.lng, d.visited_at).catch(() => null) : null);
          // updatePlace gửi lại được nhiều lần: ảnh đặt tên theo id, xoá lặp lại không lỗi
          await (item.type === 'edit' ? api.updatePlace : api.createPlace)({ ...d, weather, userId });
        }
        await discardOutbox(item.id);
        sent += 1;
      } catch (e) {
        if (isNetworkError(e)) break;
        await run('readwrite', (s) => s.put({ ...item, error: e.message }));
      }
    }
    return sent;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
