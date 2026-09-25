// Service worker: mở app và xem dữ liệu đã tải khi mất mạng. Không cache API (Supabase, Nominatim, Open-Meteo, /api).
// Đổi VERSION khi đổi chiến lược cache; file build có hash nên không cần đổi mỗi lần deploy.
const VERSION = 'v1';
const SHELL = `ht-shell-${VERSION}`;
const ASSETS = `ht-assets-${VERSION}`;
const RUNTIME = `ht-runtime-${VERSION}`; // Font, ranh giới tỉnh, style bản đồ
const TILES = `ht-tiles-${VERSION}`;
const PHOTOS = 'ht-photos'; // Xoá khi đăng xuất (App.jsx)
const KEEP = [SHELL, ASSETS, RUNTIME, TILES, PHOTOS];
const MAX_TILES = 1500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(['/index.html', '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Dùng bản trong cache ngay, đồng thời tải bản mới cho lần sau
async function staleWhileRevalidate(cacheName, request, options) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, options);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? network;
}

// allowOpaque: <img> tải ảnh khác domain không qua CORS → phản hồi opaque (status 0) vẫn dùng được để hiển thị
async function cacheFirst(cacheName, request, options, allowOpaque = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, options);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || (allowOpaque && res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

// Giới hạn số tile đã lưu: xoá bớt những tile cũ nhất (thứ tự thêm vào)
async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_TILES)).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Trang: mạng trước, mất mạng thì dùng index.html đã lưu (app tự đọc dữ liệu đã lưu)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/index.html', { cacheName: SHELL })) ?? Response.error()),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(ASSETS, request));
    else if (url.pathname.startsWith('/geo/') || url.pathname.startsWith('/icons/')) {
      event.respondWith(staleWhileRevalidate(RUNTIME, request));
    }
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(RUNTIME, request));
    return;
  }

  if (url.hostname === 'tiles.openfreemap.org') {
    event.respondWith(
      staleWhileRevalidate(TILES, request).finally(() => {
        if (Math.random() < 0.02) trimTiles();
      }),
    );
    return;
  }

  // Ảnh Supabase (signed URL): token đổi mỗi giờ nhưng đường dẫn giữ nguyên → khớp bỏ qua query
  if (url.pathname.startsWith('/storage/v1/object/sign/photos/')) {
    event.respondWith(cacheFirst(PHOTOS, request, { ignoreSearch: true }, true));
  }
});

// Thông báo "Ngày này năm trước" (Edge Function memories gửi)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Hành trình', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  );
});

// Bấm thông báo: mở tab đang có của app, hoặc mở cửa sổ mới
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.navigate(url).then((c) => c?.focus()) : self.clients.openWindow(url);
    }),
  );
});
