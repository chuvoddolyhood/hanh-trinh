// Tạo biểu tượng PWA vào public/icons (chạy lại khi đổi thiết kế): node scripts/build-icons.mjs
// Nền gradient của nút Ghi (DESIGN.md) phủ kín khung để dùng được cả dạng maskable; hình lộ trình trắng ở giữa.
import { mkdirSync, writeFileSync } from 'node:fs';
import { ImageResponse } from '@vercel/og';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Icon "route" trong src/components/icons.jsx, phóng to
const route = (size) => ({
  type: 'svg',
  props: {
    width: size * 0.56,
    height: size * 0.56,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#FFFFFF',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: [
      { type: 'path', props: { d: 'M5 19c3-1 3-6 7-7s4-6 7-7' } },
      { type: 'circle', props: { cx: 5, cy: 19, r: 1.8, fill: '#FFFFFF' } },
      { type: 'circle', props: { cx: 19, cy: 5, r: 1.8, fill: '#FFFFFF' } },
    ],
  },
});

async function icon(name, size) {
  const res = new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #FF7A1A, #FF4D8D 55%, #7B61FF)',
        },
        children: [route(size)],
      },
    },
    { width: size, height: size },
  );
  writeFileSync(new URL(name, OUT), Buffer.from(await res.arrayBuffer()));
  console.log(`public/icons/${name}`);
}

await icon('icon-192.png', 192);
await icon('icon-512.png', 512);
await icon('apple-touch-icon.png', 180);
