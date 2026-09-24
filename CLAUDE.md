# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Hành trình

Web nhật ký du lịch trên bản đồ, tối ưu cho điện thoại: check-in, ảnh có GPS, ghi lộ trình đi bộ, chia sẻ với bạn bè.

## Tài liệu dự án

- Kế hoạch, kiến trúc, danh sách tính năng và trạng thái: `docs/PLAN.md`. Đọc trước khi làm tính năng mới; cập nhật cột Trạng thái khi xong.
- Hệ thống thiết kế (màu, chữ, thành phần, màn hình): @docs/DESIGN.md
- Mẫu giao diện gốc: `docs/design/*.dc.html` (bản tối: `*Toi.dc.html`). Chỉ dùng làm tham khảo bố cục và kích thước; cú pháp `{{...}}`, `<x-dc>`, `<sc-if>`, `<dc-import>` không phải React.
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
- Chỉ dùng dịch vụ miễn phí đã chốt trong `docs/PLAN.md`; hỏi trước khi thêm dịch vụ mới.
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
- **Địa điểm** có `kind` là `visited` hoặc `wishlist`; wishlist không có `visited_at`, `mood`. Cột `visibility` đã có trong schema cho tính năng chia sẻ sau này.
- **Giao diện hiện tại** vẫn là panel bên + 3 tab (Nhật ký, Check-in, Lộ trình), chưa chuyển sang thanh tab 5 mục theo `docs/DESIGN.md`.

## Thư mục không thuộc mã nguồn

`NO/` (cache npm) và `hanh-trinh-context/` (bản sao cũ của CLAUDE.md và docs) không phải mã nguồn; không sửa, và không commit `NO/`.
