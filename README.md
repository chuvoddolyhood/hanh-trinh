# Hành trình — Giai đoạn 1 (MVP)

Nhật ký du lịch trên bản đồ: check-in, ảnh có GPS, ghi lộ trình đi bộ, nhập GPX.

**Stack (miễn phí):** React 18 + Vite, MapLibre GL JS + OpenFreeMap, Supabase (Postgres/PostGIS, Auth, Storage), Open-Meteo, Nominatim.

## Tính năng đã có

- Bản đồ vector, gom cụm điểm, tên địa điểm khi phóng to
- Check-in: chạm bản đồ, tìm theo tên, hoặc lấy GPS từ ảnh (EXIF); ghim kéo thả được
- Nhật ký: ghi chú, cảm xúc, tag, thời tiết tự điền theo ngày và vị trí
- Wishlist (nơi muốn đến)
- Timeline nhóm theo tháng, tìm không dấu, lọc theo loại, khoảng ngày, `#tag`
- Ảnh được nén (~300KB) và **xoá EXIF** trước khi upload
- Ghi lộ trình GPS trực tiếp (giữ màn hình sáng), lọc nhiễu, tự khôi phục nếu tab bị tải lại
- Nhập file GPX từ ứng dụng khác

## Cài đặt

### 1. Supabase

1. Tạo project miễn phí tại supabase.com.
2. Vào **SQL Editor**, dán toàn bộ `supabase/schema.sql` và chạy.
3. Vào **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173` (đổi thành domain thật khi deploy)
   - Thêm domain deploy vào Redirect URLs.
4. Vào **Project Settings → API**, lấy `Project URL` và `anon public key`.

### 2. Chạy local

```bash
cp .env.example .env      # điền 2 giá trị ở bước trên
npm install
npm run dev               # mở http://localhost:5173
```

### 3. Deploy (Vercel Hobby, miễn phí)

Import repo vào Vercel, framework chọn **Vite**, thêm 2 biến môi trường `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.

## Lưu ý

- **GPS cần HTTPS.** `localhost` được miễn; muốn thử trên điện thoại hãy dùng bản deploy Vercel (có HTTPS sẵn).
- **Ghi lộ trình trên web** chỉ ổn định khi màn hình mở. Lộ trình dài nên ghi bằng ứng dụng native (ví dụ OsmAnd) rồi nhập GPX.
- **Email đăng nhập:** dịch vụ email mặc định của Supabase giới hạn số email mỗi giờ; đủ cho dùng cá nhân.
- **Ảnh HEIC (iPhone):** Chrome/Android không giải mã được HEIC để nén. Trên iPhone, Safari thường tự chuyển sang JPEG khi chọn ảnh.
- **Supabase Free** tạm dừng project sau 7 ngày không hoạt động.

## Cấu trúc

```
supabase/schema.sql      Bảng, RLS, bucket ảnh
src/lib/                 Supabase, API, EXIF, GPX, thời tiết, tìm địa điểm, hàm địa lý
src/hooks/useTracker.js  Ghi lộ trình GPS
src/components/          Bản đồ, nhật ký, check-in, lộ trình, đăng nhập
```

## Bước tiếp theo

Link chia sẻ theo chuyến đi, scratch map 63/34 tỉnh, gắn ảnh không GPS vào lộ trình theo thời gian chụp, PWA/offline.
