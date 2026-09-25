# Hệ thống thiết kế — Hành trình

Nguồn gốc: canvas Claude Design "Hành trình – UI mobile" (bản sao nguồn ở `docs/design/`).
Phong cách: "Aura hành trình" — gradient mờ có hạt nhiễu, serif biên tập, chỉ số kiểu đồng hồ thể thao.

## Nguyên tắc

- **Mobile-first:** thiết kế cho khung 390×844; desktop chỉ là mở rộng.
- **Dịu ở nhật ký, đậm ở ghi lộ trình:** màn hình đọc (Bản đồ, Nhật ký, Chi tiết) dùng gradient nhạt; màn hình Ghi lộ trình dùng gradient bão hoà.
- **Scrapbook ở mức ít:** chỉ ảnh polaroid nghiêng ±2–5° và timeline đường cong nét đứt. Không băng dính, không nền giấy.
- **Có dark mode:** theo `prefers-color-scheme`, kèm nút chuyển thủ công.
- **Truy cập:** vùng chạm ≥ 44px; tương phản chữ ≥ 4.5:1; dùng `<button>`, `<a>`, `<label>` thật; icon-only có `aria-label`; tôn trọng `prefers-reduced-motion`.

## Màu (CSS custom properties)

| Token | Sáng | Tối | Dùng cho |
| --- | --- | --- | --- |
| `--bg` | `#F6F1EA` | `#26282C` | Nền màn hình |
| `--surface` | `#FFFDF9` | `#33363B` | Thẻ, chip, thanh tab |
| `--sheet` | `#F6F1EA` | `#1E1F23` | Tấm dưới màn hình Ghi lộ trình |
| `--ink` | `#1E1B18` | `#F4F1EC` | Chữ chính |
| `--muted` | `#6B625A` | `#B3AEA6` | Chữ phụ, nhãn |
| `--line` | `#E3D8CB` | `#43464C` | Đường kẻ, viền chip |
| `--accent` | `#F26B1D` | `#FF8A3D` | Ghim nơi đã đến, điểm nhấn |
| `--accent-text` | `#B4430F` | `#FFB27A` | Chữ màu nhấn (tag, tab đang chọn) |
| `--route` | `#F0508A` | `#FF4D8D` | Đường lộ trình |
| `--wishlist` | `#7B61FF` | `#9B8CFF` | Ghim muốn đến (vòng rỗng) |
| `--wishlist-text` | `#5B4BD6` | `#B8ADFF` | Chữ nhãn "Muốn đến" |

Gradient:

- **Nút Ghi (tab giữa):** `linear-gradient(135deg, #FF7A1A, #FF4D8D 55%, #7B61FF)`
- **Trời màn hình Ghi lộ trình, sáng:** `linear-gradient(170deg, #7B61FF 0%, #C04DD8 30%, #FF4D8D 58%, #FF8A1F 84%, #FFC23D 100%)`
- **Trời màn hình Ghi lộ trình, tối:** `linear-gradient(170deg, #241B5E 0%, #6A2BD9 32%, #E0337A 64%, #FF7A1A 100%)`
- **Thanh tiến độ:** `linear-gradient(90deg, #FFD37A, #FF8A3D 50%, #FF4D8D)`
- **Hạt nhiễu (grain):** SVG `feTurbulence` (`baseFrequency 0.9`, `numOctaves 2`, khử màu), `opacity 0.28`, `mix-blend-mode: overlay` phủ lên gradient.

## Quả cầu aura (điểm nhận diện)

Quả cầu `radial-gradient` mờ (`filter: blur(2–4px)`), nửa dưới chìm vào đường chân trời bằng một lớp `linear-gradient` từ trong suốt sang `--bg`. Màu theo dữ liệu thật (mã WMO từ Open-Meteo, giờ check-in):

| Điều kiện | Màu tâm → rìa |
| --- | --- |
| Trời quang, ít mây (0–1) | `#FF7A2E → #FF9C5A → #FFC49A` |
| Có mây, nhiều mây, sương (2–48) | `#F2A57A → #F4C6A8 → #EADFD3` |
| Mưa, mưa phùn, mưa rào (51–67, 80–82) | `#6F8FE8 → #9FB4F0 → #CBD6F5` |
| Dông (95–99) | `#5B3FD6 → #8B6FF0 → #C3B6F7` |
| Check-in sau 18:00 | `#9B8CF2 → #C3B6F7 → #E4DDFB` |
| Dark mode (mọi điều kiện) | `#FFFFFF → #E4E6EA → #9FA3AA` |

## Chữ

Google Fonts: `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap`

| Vai trò | Font | Cỡ / độ đậm |
| --- | --- | --- |
| Tiêu đề màn hình | Playfair Display | 46px / 400, letter-spacing −0.01em |
| Số lớn (km, nhiệt độ) | Playfair Display | 64–76px / 400, letter-spacing −0.03em |
| Tên địa điểm (chi tiết) | Playfair Display, IN HOA | 30px / 400, letter-spacing 0.24em |
| Tên địa điểm (thẻ, danh sách) | Playfair Display | 20–22px / 600 |
| Chú thích ảnh polaroid | Playfair Display nghiêng | 13px |
| Nội dung | Be Vietnam Pro | 14–15px / 400, line-height 1.55 |
| Nút, tab | Be Vietnam Pro | 11px (tab), 15–16px / 600 (nút) |
| Nhãn chỉ số | JetBrains Mono, IN HOA | 11px / 500, letter-spacing 0.08–0.2em |
| Giá trị chỉ số | Be Vietnam Pro | 26px / 500, `font-variant-numeric: tabular-nums` |

## Thành phần

- **Thanh tab dưới:** cao 84px, nền `--surface` 96% đục, viền trên `--line`. 5 mục: Bản đồ, Nhật ký, nút Ghi (tròn 60px, gradient, nổi lên −24px, bóng hồng), Chuyến đi, Tôi. Mục đang chọn màu `--accent-text`, chữ 600. Chừa `env(safe-area-inset-bottom)`.
- **Ảnh polaroid:** khung trắng, padding `8px 8px 30px`, bóng `0 8px 20px rgba(80,50,20,.16)`, xoay ±2–5°, chú thích serif nghiêng ở mép dưới.
- **Timeline nhật ký:** SVG đường cong S nét đứt (`#E0A276`, `stroke-dasharray 4 6`), mục xen kẽ trái/phải, chấm cam (đã đến) hoặc vòng tím (muốn đến).
- **Hàng thống kê:** lưới 3 cột, kẻ trên dưới `--line`, vách giữa các cột; nhãn mono + số serif.
- **Chip lọc:** cao 36px, bo tròn hoàn toàn; đang chọn nền `--ink` chữ `--surface`.
- **Thẻ xem nhanh (bản đồ):** bo 24px, cao 128px, polaroid nhỏ xoay −4°, nằm trên thanh tab 16px.
- **Nút nổi Check-in:** pill 48px, nền `--ink`, chữ `--surface`.
- **Màn hình Ghi lộ trình:** 46% trên là trời gradient + grain + đường lộ trình trắng; tấm dưới bo `28px 28px 0 0`. Nút Tạm dừng (viền) và Kết thúc (nền `--ink`, ô vuông hồng). Nút thu nhỏ quay về bản đồ mà vẫn ghi.

## Bản đồ nền

Dùng style Liberty của OpenFreeMap rồi chỉnh màu bằng `map.setPaintProperty` sau sự kiện `load` (không tự host style):

| Lớp | Màu sáng |
| --- | --- |
| Đất | `#F4EADF` |
| Khối nhà | `#EEE0CF` |
| Nước | `#C9DDDA` (viền `#BCD4D1`) |
| Công viên, rừng | `#DCE3C3` |
| Đường thường | `#FFFFFF`, viền `#E8DCCB` |
| Đường chính | `#F8DDB0`, viền `#E6D3BC` |
| Nhãn phụ | `#8A7F73` |

Dark mode: style `dark` của OpenFreeMap (chưa hoàn thiện, cần chỉnh thêm) hoặc tự tối hoá Liberty theo cùng cách.

## Màn hình

| Màn hình | File mẫu | Trạng thái |
| --- | --- | --- |
| Bản đồ | `docs/design/Main.dc.html` | Đã thiết kế |
| Nhật ký | `docs/design/NhatKy.dc.html` | Đã thiết kế |
| Chi tiết địa điểm (sáng/tối) | `docs/design/ChiTiet.dc.html` | Đã thiết kế |
| Ghi lộ trình (sáng/tối) | `docs/design/GhiLoTrinh.dc.html` | Đã thiết kế |
| Chuyến đi, Tôi, Check-in | — | Chưa thiết kế |

Đã chốt: màn hình Ghi lộ trình có "Tạm dừng" và "Mục tiêu hôm nay" (mặc định 5 km, chỉnh ở tab Tôi, lưu trên máy). Tab Chuyến đi gồm danh sách chuyến, chi tiết và phần chia sẻ; tab Tôi gồm giao diện sáng/tối, mục tiêu, vùng riêng tư, lộ trình đã lưu, nhập GPX, đăng xuất (cả hai chưa có mẫu thiết kế, dựng theo thành phần sẵn có). Ô "Tỉnh, thành" đếm theo 34 hoặc 63 tỉnh (chọn ở tab Tôi); số quốc gia hiện ở dòng dưới hàng thống kê. Scratch map tô tỉnh đã đến bằng `--accent` độ đục 0.28, không vẽ viền.

Lưu ý khi đọc file `.dc.html`: cú pháp `{{...}}`, `<x-dc>`, `<sc-if>`, `<dc-import>` là của công cụ thiết kế, không phải React. Chỉ lấy bố cục, màu, kích thước; dữ liệu trong mẫu (Hội An, 3,42 km...) là ví dụ.
