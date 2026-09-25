# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Hành trình

Web nhật ký du lịch trên bản đồ, tối ưu cho điện thoại: check-in, ảnh có GPS, ghi lộ trình đi bộ, chia sẻ với bạn bè.

## Tài liệu dự án

- Kế hoạch, kiến trúc, danh sách tính năng và trạng thái: `hanh-trinh-context/docs/PLAN.md`. Đọc trước khi làm tính năng mới; cập nhật cột Trạng thái khi xong.
- Hệ thống thiết kế (màu, chữ, thành phần, màn hình): @hanh-trinh-context/docs/DESIGN.md
- Mẫu giao diện gốc: `hanh-trinh-context/docs/design/*.dc.html` (bản tối: `*Toi.dc.html`). Chỉ dùng làm tham khảo bố cục và kích thước; cú pháp `{{...}}`, `<x-dc>`, `<sc-if>`, `<dc-import>` không phải React.
- `README.md`: cách dựng Supabase (chạy `supabase/schema.sql` trong SQL Editor, cấu hình Redirect URLs) và các giới hạn đã biết (GPS cần HTTPS, HEIC, Supabase Free tạm dừng sau 7 ngày).

## Stack

React 18 + Vite (JavaScript, không TypeScript), MapLibre GL JS + OpenFreeMap, Supabase (Postgres/PostGIS, Auth, Storage), exifr, browser-image-compression, @tmcw/togeojson, Open-Meteo, Nominatim. Deploy Vercel.

## Lệnh

- `npm install` (máy dev đang cấu hình npm registry nội bộ → thêm `--registry=https://registry.npmjs.org` khi cài gói mới để `package-lock.json` chỉ chứa registry công khai, Vercel và CI mới tải được)
- `npm run dev` (http://localhost:5173)
- `npm run build` / `npm run preview`

Chưa có lint hay test; kiểm tra bằng `npm run build` và chạy thử trên trình duyệt. Cần file `.env` với `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (mẫu: `.env.example`); thiếu thì app hiện màn hình hướng dẫn thay vì lỗi. Không commit `.env`.

## Quy tắc

- Comment trong code viết bằng tiếng Việt; toàn bộ chữ trên giao diện bằng tiếng Việt.
- Không dùng thư viện hay API không tồn tại; kiểm tra tài liệu chính thức khi không chắc.
- Chỉ dùng dịch vụ miễn phí đã chốt trong `PLAN.md`; hỏi trước khi thêm dịch vụ mới.
- Mọi bảng mới phải bật RLS; cập nhật `supabase/schema.sql` khi đổi schema (file phải chạy lại được nhiều lần: `if not exists`, `drop policy if exists`).
- Ảnh luôn được nén và xoá EXIF trước khi upload (`src/lib/photo.js`).
- Nominatim: tối đa 1 request/giây, không gọi theo từng phím gõ (`src/lib/geocode.js`).
- Giao diện mobile-first 390px, vùng chạm ≥ 44px, hỗ trợ dark mode, tôn trọng `prefers-reduced-motion`.

## Kiến trúc

- **Vercel Functions** (`api/`, Edge runtime): `share.js` trả `index.html` kèm thẻ Open Graph cho `/s/<token>` (rewrite trong `vercel.json`), `og.js` vẽ ảnh bìa bằng `@vercel/og` (phần tử dạng `{ type, props }`, không JSX; font woff từ Fontsource vì satori không đọc woff2). `_trip.js` gọi REST Supabase bằng anon key và dùng lại `src/lib/geo.js`, `dates.js`. Giữ `@vercel/og` ở 0.11.x: bản 1.0.x lỗi khi chạy trên Node (thử cục bộ).

- **Không có router hay store.** `src/App.jsx` giữ toàn bộ state (`places`, `tracks`, địa điểm đang chọn, ghim nháp, `focus` bản đồ) trong `Workspace` và truyền xuống qua props. Sau mỗi thay đổi dữ liệu, component gọi `onSaved`/`onChanged` → `reload()` tải lại cả hai danh sách.
- **Truy cập dữ liệu chỉ qua `src/lib/api.js`**, gọi thẳng Supabase từ trình duyệt; bảo mật hoàn toàn dựa vào RLS. `user_id` có default `auth.uid()`, client không cần gửi. RLS cho bạn bè đọc nơi `visibility = 'friends'`, nên truy vấn dữ liệu của mình phải lọc `.eq('user_id', userId)` (`listPlaces(userId)`), không được dựa vào RLS để chỉ lấy của mình.
- **Bạn bè:** `profiles` (tạo bằng trigger khi đăng ký), `invites` (token link mời, chỉ chủ đọc), `friendships` (một dòng mỗi cặp). Tìm người và nhận lời mời qua RPC `find_profile`, `request_friend`, `accept_invite`. Link `/?invite=<token>` được lưu vào `localStorage` lúc tải trang (sống qua bước đăng ký), `Workspace` nhận sau khi đăng nhập. Xem bản đồ bạn: state `friend` trong `Workspace`; `PlaceDetail` có prop `owner` để chuyển sang chế độ chỉ xem. Bình luận/thả tim ở `PlaceSocial` (Realtime; sự kiện DELETE không lọc được theo `place_id`).
- **Ảnh:** bucket riêng tư `photos`, đường dẫn bắt buộc `<userId>/<placeId>/<uuid>.jpg` vì policy Storage kiểm tra thư mục đầu là `auth.uid()`. Hiển thị bằng signed URL (1 giờ, `usePhotoUrls` nhớ URL dùng chung các màn hình). GPS gốc của ảnh chỉ lưu trong bảng `photos`. Mỗi ảnh có thêm ảnh nhỏ `<uuid>_t.jpg` (400px, không ghi vào bảng `photos`; policy bạn bè/chia sẻ quy `_t.jpg` về ảnh gốc): thẻ, nhật ký, story dùng `usePhotoUrls(paths, { thumb: true })`, ảnh cũ chưa có ảnh nhỏ tự dùng ảnh gốc; xoá ảnh phải xoá cả hai. HEIC chuyển sang JPEG lúc chọn ảnh (`toJpegIfHeic`, import động `heic-to`) sau khi đã đọc EXIF.
- **Lộ trình:** `points` là jsonb dạng `[[lng, lat, epochMs|null], ...]`, dùng chung cho ghi trực tiếp (`source: 'live'`) và nhập GPX (`'gpx'`). `useTracker` được gọi ở `Workspace` để vẫn ghi khi đổi tab; lọc điểm theo độ chính xác/tốc độ/khoảng cách, giữ màn hình sáng (Wake Lock) và lưu tạm vào `localStorage` (`hanh-trinh:unsaved-track`) để khôi phục khi tải lại trang.
- **Bản đồ:** `MapView.jsx` tạo một instance MapLibre với style Liberty của OpenFreeMap, cập nhật dữ liệu qua các GeoJSON source `places` (có cluster), `tracks`, `live`, và điều khiển camera qua prop `focus`.
- **Chuyến đi** gom theo khoảng ngày (`start_date`–`end_date`), không có cột liên kết: nơi `visited` có `visited_at` trong khoảng, lộ trình có ngày `started_at` (theo `trips.tz`) trong khoảng. Logic này có ở hai nơi phải khớp nhau: `tripItems` trong `TripsScreen.jsx` và `private.trip_places`/`shared_trip` trong `schema.sql`.
- **Chia sẻ:** URL `/?s=<share_token>` → `App` render `SharedTrip` trước khi kiểm tra đăng nhập. Dữ liệu lấy qua RPC `public.shared_trip` (security definer), đã bỏ nơi trong vùng riêng tư và cắt lộ trình ở server; ảnh xem được nhờ policy Storage `photos_bucket_shared`. Hàm phụ nằm trong schema `private` để PostgREST không mở ra ngoài.
- **Địa điểm** có `kind` là `visited` hoặc `wishlist`; wishlist không có `visited_at`, `mood`. Cột `visibility` của `places`/`tracks` chưa dùng; chia sẻ dựa vào `trips.visibility`.
- **Giao diện:** không có router. `MapView` luôn được mount và nằm dưới cùng; các màn hình (`.screen`: Nhật ký, Chuyến đi, Chi tiết, Ghi lộ trình, Tôi) phủ lên trên, điều khiển bằng state `tab`, `detailId`, `recordOpen`, `checkin` trong `Workspace`. Check-in là tấm dưới trên bản đồ; `checkin` là `null` hoặc `{ place }` (có `place` là đang sửa check-in cũ, dùng chung `CheckinForm`). Đổi sáng/tối thì remount `MapView` bằng `key` (style `liberty` được chỉnh màu hoặc style `dark`).
- **Chuyến nhóm:** thành viên ở `trip_members`; mục được chia sẻ với nhóm có `places.trip_id`/`tracks.trip_id` (người tự chọn, không tự động theo ngày). Chủ vẫn thấy mọi mục của mình theo khoảng ngày; thành viên chỉ thấy mục đã chọn. Rời chuyến → trigger gỡ `trip_id`. Link chia sẻ công khai (`shared_trip`) chỉ gồm dữ liệu của chủ.
- **PWA:** `public/sw.js` viết tay (không plugin), chỉ đăng ký ở bản build (`main.jsx`). Không cache API; ảnh cache theo đường dẫn bỏ query (`ht-photos`), xoá khi đăng xuất cùng dữ liệu offline `hanh-trinh:offline:<userId>` (`clearOffline` trong `App.jsx`). `reload()` lỗi mạng thì dùng bản đã lưu. Biểu tượng tạo bằng `scripts/build-icons.mjs`.
- **Ngoại tuyến:** check-in mới và lộ trình lưu lúc mất mạng vào hàng chờ IndexedDB (`src/lib/outbox.js`, giữ được File ảnh), gửi lại khi mở app và sự kiện `online`. id tạo ở máy nên `createPlace`/`createTrack`/`uploadPhotos` phải idempotent (kiểm tra đã có, tên ảnh theo id, bỏ qua lỗi Storage 409). `Workspace` gộp mục chờ vào `places`/`tracks` với cờ `pending`; sửa check-in cũ vẫn cần mạng. Hàng chờ chỉ xoá khi bấm Đăng xuất (có hỏi), không xoá theo sự kiện `SIGNED_OUT`.
- **Huy hiệu, độ cao:** `src/lib/badges.js` (thuần, tỉnh/miền theo bộ 34 tỉnh); `src/lib/elevation.js` gọi Open-Meteo Elevation (≤100 điểm/request, phải ghi nguồn Copernicus).
- **Tổng kết năm, sao lưu:** `src/lib/recap.js` tính số liệu (thuần), `YearRecap` dùng lại giao diện `.story`; `src/lib/backup.js` xuất GeoJSON/GPX 1.1 (chưa gồm ảnh).
- **Story, poster:** `StoryPlayer` điều khiển bản đồ bên dưới qua `onFocus` (dùng cả ở `SharedTrip`). Poster: `MapView` là `forwardRef`, `ref.capture()` đợi bản đồ đứng yên rồi chép canvas trong sự kiện `render`; `src/lib/poster.js` ghép chữ bằng canvas 2D (nhãn dùng Be Vietnam Pro vì JetBrains Mono vỡ dấu chồng khi giãn chữ trên canvas).
- **Google Timeline:** `src/lib/timeline.js` đọc 3 định dạng (Takeout `timelineObjects`, Android `semanticSegments`, iPhone mảng `geo:`); `TimelineImport` nhập nơi (tag `google`) và lộ trình (`source: 'google'`).
- **Ngày này năm trước:** thẻ trong `Timeline` tính ở client; thông báo đẩy do Edge Function `supabase/functions/memories` (Deno, JS thuần trong file `.ts`) gửi, gọi RPC `memories_on` bằng service role, lịch pg_cron ghi trong README.
- **Tỉnh, quốc gia:** `src/lib/regions.js` tra điểm trong đa giác từ `public/geo/*.json` (tạo bằng `scripts/build-geo.py`, không sửa tay), không lưu vào database. `App` tính `regions` mỗi khi `places` đổi; scratch map là layer `provinces-fill` trong `MapView`.
- **Dark mode:** `App` đặt `data-theme` trên `<html>`; mọi màu là biến CSS trong `src/styles.css`. Màu trên bản đồ (layer MapLibre) nằm riêng trong `COLORS` của `MapView.jsx`, phải giữ khớp với biến CSS.

## Thư mục không thuộc mã nguồn

`NO/` là cache npm, không commit. `hanh-trinh-context/CLAUDE.md` là bản sao cũ, đừng sửa; tài liệu thật nằm ở `hanh-trinh-context/docs/`.
