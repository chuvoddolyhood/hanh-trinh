// Ảnh bìa 1200×630 cho link chia sẻ: /api/og?t=<token>
import { ImageResponse } from '@vercel/og';
import { getSharedTrip, signPhoto, summarize } from './_trip.js';

export const config = { runtime: 'edge' };

// Font có đủ dấu tiếng Việt (satori không đọc woff2 → dùng woff của Fontsource); nạp một lần mỗi instance
const FONT_BASE = 'https://cdn.jsdelivr.net/npm/@fontsource';
const FONT_FILES = [
  ['Playfair Display', 400, 'playfair-display@5/files/playfair-display-latin-400-normal.woff'],
  ['Playfair Display', 400, 'playfair-display@5/files/playfair-display-vietnamese-400-normal.woff'],
  ['Be Vietnam Pro', 500, 'be-vietnam-pro@5/files/be-vietnam-pro-latin-500-normal.woff'],
  ['Be Vietnam Pro', 500, 'be-vietnam-pro@5/files/be-vietnam-pro-vietnamese-500-normal.woff'],
];
let fontsPromise;
const loadFonts = () =>
  (fontsPromise ??= Promise.all(
    FONT_FILES.map(async ([name, weight, file]) => ({
      name,
      weight,
      style: 'normal',
      data: await fetch(`${FONT_BASE}/${file}`).then((r) => r.arrayBuffer()),
    })),
  ).catch((e) => {
    fontsPromise = null;
    throw e;
  }));

// Satori nhận phần tử dạng { type, props } nên không cần JSX
// Satori bắt buộc display: flex cho phần tử có nhiều con → đặt mặc định
const h = (type, style, ...children) => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.filter((c) => c != null && c !== false) },
});

// Tự tải ảnh để lỗi mạng hay link hết hạn chỉ làm mất ảnh, không làm hỏng cả ảnh bìa
async function loadPhoto(path) {
  const url = path && (await signPhoto(path));
  if (!url) return null;
  const res = await fetch(url);
  return res.ok ? res.arrayBuffer() : null;
}

// Gradient trời của màn hình Ghi lộ trình (DESIGN.md)
const SKY = 'linear-gradient(170deg, #7B61FF 0%, #C04DD8 30%, #FF4D8D 58%, #FF8A1F 84%, #FFC23D 100%)';

export default async function handler(req) {
  const token = new URL(req.url).searchParams.get('t');
  const data = await getSharedTrip(token);
  const s = data && summarize(data);
  const photo = await loadPhoto(s?.cover).catch(() => null);

  const text = h(
    'div',
    { display: 'flex', flexDirection: 'column', flex: 1, gap: 18, color: '#FFFFFF' },
    h('div', { fontFamily: 'Be Vietnam Pro', fontSize: 24, letterSpacing: 6, opacity: 0.9 }, 'HÀNH TRÌNH'),
    h(
      'div',
      { fontFamily: 'Playfair Display', fontSize: s && s.name.length > 28 ? 60 : 80, lineHeight: 1.05, letterSpacing: -1 },
      s ? s.name : 'Nhật ký hành trình',
    ),
    s && h('div', { fontFamily: 'Be Vietnam Pro', fontSize: 30, opacity: 0.92 }, s.range),
    s && h('div', { fontFamily: 'Be Vietnam Pro', fontSize: 30, marginTop: 12 }, s.stats.join('  ·  ')),
  );

  const polaroid = photo && h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 16px 60px',
      background: '#FFFFFF',
      boxShadow: '0 20px 50px rgba(60, 20, 40, 0.35)',
      transform: 'rotate(-4deg)',
    },
    { type: 'img', props: { src: photo, width: 380, height: 380, style: { objectFit: 'cover' } } },
  );

  return new ImageResponse(
    h(
      'div',
      { display: 'flex', alignItems: 'center', gap: 56, width: '100%', height: '100%', padding: '64px 80px', background: SKY },
      text,
      polaroid,
    ),
    {
      width: 1200,
      height: 630,
      fonts: await loadFonts(),
      // Chuyến tắt chia sẻ thì ảnh cũ còn trong cache CDN tối đa 1 giờ
      headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600' },
    },
  );
}
