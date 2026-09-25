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

- `npm install`
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

- **Không có router hay store.** `src/App.jsx` giữ toàn bộ state (`places`, `tracks`, địa điểm đang chọn, ghim nháp, `focus` bản đồ) trong `Workspace` và truyền xuống qua props. Sau mỗi thay đổi dữ liệu, component gọi `onSaved`/`onChanged` → `reload()` tải lại cả hai danh sách.
- **Truy cập dữ liệu chỉ qua `src/lib/api.js`**, gọi thẳng Supabase từ trình duyệt; bảo mật hoàn toàn dựa vào RLS (mỗi user chỉ thấy dữ liệu của mình). `user_id` có default `auth.uid()`, client không cần gửi.
- **Ảnh:** bucket riêng tư `photos`, đường dẫn bắt buộc `<userId>/<placeId>/<uuid>.jpg` vì policy Storage kiểm tra thư mục đầu là `auth.uid()`. Hiển thị bằng signed URL (1 giờ). GPS gốc của ảnh chỉ lưu trong bảng `photos`.
- **Lộ trình:** `points` là jsonb dạng `[[lng, lat, epochMs|null], ...]`, dùng chung cho ghi trực tiếp (`source: 'live'`) và nhập GPX (`'gpx'`). `useTracker` được gọi ở `Workspace` để vẫn ghi khi đổi tab; lọc điểm theo độ chính xác/tốc độ/khoảng cách, giữ màn hình sáng (Wake Lock) và lưu tạm vào `localStorage` (`hanh-trinh:unsaved-track`) để khôi phục khi tải lại trang.
- **Bản đồ:** `MapView.jsx` tạo một instance MapLibre với style Liberty của OpenFreeMap, cập nhật dữ liệu qua các GeoJSON source `places` (có cluster), `tracks`, `live`, và điều khiển camera qua prop `focus`.
- **Chuyến đi** gom theo khoảng ngày (`start_date`–`end_date`), không có cột liên kết: nơi `visited` có `visited_at` trong khoảng, lộ trình có ngày `started_at` (theo `trips.tz`) trong khoảng. Logic này có ở hai nơi phải khớp nhau: `tripItems` trong `TripsScreen.jsx` và `private.trip_places`/`shared_trip` trong `schema.sql`.
- **Chia sẻ:** URL `/?s=<share_token>` → `App` render `SharedTrip` trước khi kiểm tra đăng nhập. Dữ liệu lấy qua RPC `public.shared_trip` (security definer), đã bỏ nơi trong vùng riêng tư và cắt lộ trình ở server; ảnh xem được nhờ policy Storage `photos_bucket_shared`. Hàm phụ nằm trong schema `private` để PostgREST không mở ra ngoài.
- **Địa điểm** có `kind` là `visited` hoặc `wishlist`; wishlist không có `visited_at`, `mood`. Cột `visibility` của `places`/`tracks` chưa dùng; chia sẻ dựa vào `trips.visibility`.
- **Giao diện:** không có router. `MapView` luôn được mount và nằm dưới cùng; các màn hình (`.screen`: Nhật ký, Chuyến đi, Chi tiết, Ghi lộ trình, Tôi) phủ lên trên, điều khiển bằng state `tab`, `detailId`, `recordOpen`, `checkin` trong `Workspace`. Check-in là tấm dưới trên bản đồ; `checkin` là `null` hoặc `{ place }` (có `place` là đang sửa check-in cũ, dùng chung `CheckinForm`). Đổi sáng/tối thì remount `MapView` bằng `key` (style `liberty` được chỉnh màu hoặc style `dark`).
- **Tỉnh, quốc gia:** `src/lib/regions.js` tra điểm trong đa giác từ `public/geo/*.json` (tạo bằng `scripts/build-geo.py`, không sửa tay), không lưu vào database. `App` tính `regions` mỗi khi `places` đổi; scratch map là layer `provinces-fill` trong `MapView`.
- **Dark mode:** `App` đặt `data-theme` trên `<html>`; mọi màu là biến CSS trong `src/styles.css`. Màu trên bản đồ (layer MapLibre) nằm riêng trong `COLORS` của `MapView.jsx`, phải giữ khớp với biến CSS.

## Thư mục không thuộc mã nguồn

`NO/` là cache npm, không commit. `hanh-trinh-context/CLAUDE.md` là bản sao cũ, đừng sửa; tài liệu thật nằm ở `hanh-trinh-context/docs/`.
