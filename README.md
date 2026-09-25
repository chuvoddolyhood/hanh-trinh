# Hành trình — Giai đoạn 1 (MVP)

Nhật ký du lịch trên bản đồ: check-in, ảnh có GPS, ghi lộ trình đi bộ, nhập GPX.

**Stack (miễn phí):** React 18 + Vite, MapLibre GL JS + OpenFreeMap, Supabase (Postgres/PostGIS, Auth, Storage), Open-Meteo, Nominatim.

## Tính năng đã có

- Bản đồ vector, gom cụm điểm, tên địa điểm khi phóng to
- Check-in: chạm bản đồ, tìm theo tên, hoặc lấy GPS từ ảnh (EXIF); ghim kéo thả được; sửa check-in, thêm/xoá ảnh
- Ảnh không có GPS được lấy vị trí từ lộ trình đã ghi theo giờ chụp (lệch tối đa 10 phút)
- Nhật ký: ghi chú, cảm xúc, tag, thời tiết tự điền theo ngày và vị trí
- Wishlist (nơi muốn đến)
- Timeline nhóm theo tháng, tìm không dấu, lọc theo loại, khoảng ngày, `#tag`
- Ảnh được nén (~300KB) và **xoá EXIF** trước khi upload
- Ghi lộ trình GPS trực tiếp (giữ màn hình sáng), lọc nhiễu, tự khôi phục nếu tab bị tải lại
- Nhập file GPX từ ứng dụng khác
- Chuyến đi: gom nơi đã đến và lộ trình theo khoảng ngày
- Link chia sẻ chuyến đi (`/?s=<token>`), xem không cần đăng nhập; đổi link để thu hồi link cũ
- Vùng riêng tư: nơi và đoạn lộ trình trong vùng bị ẩn khi chia sẻ (cắt ở server)
- Bạn bè: kết bạn bằng link mời hoặc @username; mỗi check-in chọn "Chỉ mình tôi" hoặc "Bạn bè"; xem bản đồ của bạn, thả tim và bình luận (cập nhật tức thì qua Supabase Realtime)
- Chuyến đi nhóm: mời bạn bè vào chuyến, mỗi người tự chọn nơi và lộ trình của mình để chia sẻ với nhóm
- Link chia sẻ dạng `/s/<token>` có ảnh bìa (tên chuyến, ngày, số km, ảnh polaroid) khi gửi qua Zalo, Facebook, Messenger
- Heatmap khu vực đi qua nhiều (nút "Nơi đi nhiều" trên bản đồ)
- Xem lại chuyến đi dạng story (cả trên link chia sẻ), tạo poster bản đồ 1080×1350 để lưu hoặc đăng
- Cài lên màn hình chính (PWA), mở và xem dữ liệu đã tải khi mất mạng
- Nhập nơi đã ghé và lộ trình đi bộ từ Google Timeline (Android, iPhone) hoặc Google Takeout
- "Ngày này năm trước" trong Nhật ký, kèm thông báo đẩy mỗi sáng (tuỳ chọn, xem mục 5)
- Scratch map tô tỉnh đã đến (nút "Tỉnh đã đến" trên bản đồ), đếm theo 34 hoặc 63 tỉnh (chọn ở tab Tôi); đếm số quốc gia đã đến

## Cài đặt

### 1. Supabase

1. Tạo project miễn phí tại supabase.com.
2. Vào **SQL Editor**, dán toàn bộ `supabase/schema.sql` và chạy. File chạy lại được nhiều lần; mỗi khi schema đổi, chạy lại toàn bộ.
   Database đã dựng từ trước: chạy lần lượt các file trong `supabase/migrations/` (theo tên file) thay vì chạy lại toàn bộ; `20260925_anh-nho.sql` cho phép bạn bè và link chia sẻ xem ảnh nhỏ; `20260926_chi-phi-chuyen-di.sql` thêm bảng chi phí chuyến đi; `20260926_sua-chi-phi-realtime.sql` cho sửa khoản chi và cập nhật tức thì; `20260927_xep-hang-nhac-di-bo.sql` cho bảng xếp hạng bạn bè và nhắc đi bộ.
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

Import repo vào Vercel, framework chọn **Vite**, thêm 2 biến môi trường `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Vercel tự deploy mỗi lần push; workflow `.github/workflows/build.yml` chỉ kiểm tra build trên PR và nhánh `main`.

Link chia sẻ `/s/<token>` chạy qua Vercel Function (`api/share.js` chèn thẻ Open Graph, `api/og.js` vẽ ảnh bìa); hai function dùng chung 2 biến môi trường trên. Chạy `npm run dev` thì không có function nhưng link vẫn mở được (thiếu ảnh xem trước).

### 4. Giữ Supabase không bị tạm dừng

Workflow `.github/workflows/keep-supabase-alive.yml` gọi API mỗi 3 ngày. Vào GitHub repo → **Settings → Secrets and variables → Actions**, thêm `SUPABASE_URL` và `SUPABASE_ANON_KEY` (giống trong `.env`), rồi vào tab **Actions** chạy tay một lần để kiểm tra. GitHub tự tắt lịch chạy nếu repo không có commit trong 60 ngày; khi đó bật lại trong tab Actions.

### 5. Thông báo "Ngày này năm trước" (tuỳ chọn)

Cần [Supabase CLI](https://supabase.com/docs/guides/cli). Thẻ "Ngày này năm trước" trong Nhật ký vẫn chạy khi bỏ qua bước này.

1. Tạo khoá: `npx web-push generate-vapid-keys`. Khoá công khai đặt vào biến `VITE_VAPID_PUBLIC_KEY` (Vercel và `.env`), rồi deploy lại.
2. Đặt secret cho function (CRON_SECRET là một chuỗi ngẫu nhiên tự chọn):
   `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:ban@example.com CRON_SECRET=...`
3. Deploy: `supabase functions deploy memories --no-verify-jwt`
4. Bật extension `pg_cron` và `pg_net` (Database → Extensions), rồi chạy trong SQL Editor (thay `<ref>` và `<CRON_SECRET>`), gửi lúc 8:00 giờ Việt Nam:
   ```sql
   select cron.schedule('hanh-trinh-memories', '0 1 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/memories',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb
     )
   $$);
   ```
5. Trong app: tab Tôi → "Bật thông báo". Trên iPhone phải thêm app vào màn hình chính trước (iOS 16.4 trở lên).
6. Nhắc mục tiêu đi bộ lúc 20:00 (tuỳ chọn, dùng chung secret ở bước 2): `supabase functions deploy walk-reminder --no-verify-jwt`, rồi thêm lịch (13:00 UTC = 20:00 giờ Việt Nam):
   ```sql
   select cron.schedule('hanh-trinh-walk-reminder', '0 13 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/walk-reminder',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb
     )
   $$);
   ```
   Người dùng bật ở tab Tôi → Thông báo → "Nhắc lúc 20:00…". Hai function dùng chung `supabase/functions/_shared/push.ts`; sửa file này thì deploy lại cả hai.

## Lưu ý

- **GPS cần HTTPS.** `localhost` được miễn; muốn thử trên điện thoại hãy dùng bản deploy Vercel (có HTTPS sẵn).
- **Ghi lộ trình trên web** chỉ ổn định khi màn hình mở. Lộ trình dài nên ghi bằng ứng dụng native (ví dụ OsmAnd) rồi nhập GPX.
- **Email đăng nhập:** dịch vụ email mặc định của Supabase giới hạn số email mỗi giờ; đủ cho dùng cá nhân.
- **Ảnh HEIC (iPhone):** được chuyển sang JPEG ngay trên máy bằng `heic-to` (tải thêm ~730 KB gzip, chỉ khi gặp ảnh HEIC); ảnh rất lớn có thể chậm trên máy yếu.
- **Supabase Free** tạm dừng project sau 7 ngày không hoạt động (xem mục 4 ở trên).
- **Chuyến đi** gom theo khoảng ngày, chưa bỏ riêng được một nơi khỏi chuyến. Muốn giấu nơi nào khi chia sẻ thì đặt vùng riêng tư.
- **Mất mạng:** mở được app, xem nơi, lộ trình, ảnh và vùng bản đồ đã xem trước đó; chưa check-in hay ghi lộ trình khi offline được. Đăng xuất sẽ xoá dữ liệu, ảnh đã lưu trên máy.
- **Nhập Google Timeline:** bỏ nơi Google đánh dấu là nhà, chỗ làm; gộp các lần ghé cùng một nơi; chỉ lấy lộ trình đi bộ, chạy. Tự đặt tên theo địa chỉ khi dưới 100 nơi (Nominatim, 1 giây/nơi).
- **Mức "Công khai"** hiện giống "Có link": đều cần link mới xem được. Trang hồ sơ công khai để dành cho giai đoạn 2.

## Dữ liệu ranh giới

`public/geo/*.json` được tạo bằng `python3 scripts/build-geo.py` (chỉ cần Python 3, không cần thư viện):

- Tỉnh: [geoBoundaries](https://www.geoboundaries.org) VNM ADM1 (public domain), 63 tỉnh, gắn tên tỉnh mới theo Nghị quyết 202/2025/QH15. Bảng sáp nhập nằm trong script.
- Quốc gia: [Natural Earth](https://www.naturalearthdata.com) 1:50m admin 0 (public domain).

Điểm không nằm trong vùng nào (bãi biển, đảo nhỏ bị đơn giản hoá) được gán cho vùng gần nhất trong 20 km.

## Cấu trúc

```
supabase/schema.sql      Bảng, RLS, bucket ảnh
src/lib/                 Supabase, API, EXIF, GPX, thời tiết, tìm địa điểm, hàm địa lý
src/hooks/useTracker.js  Ghi lộ trình GPS
src/components/          Bản đồ, nhật ký, check-in, lộ trình, đăng nhập
```

## Bước tiếp theo

Giai đoạn 2: bạn bè, bình luận, chuyến đi nhóm (xem `hanh-trinh-context/docs/PLAN.md`).
