// Ghép poster 1080×1350 từ ảnh chụp bản đồ: bản đồ phía trên, dải thông tin phía dưới (màu theo DESIGN.md)

const W = 1080;
const H = 1350;
const MAP_H = 1010;

const THEME = {
  light: { bg: '#F6F1EA', ink: '#1E1B18', muted: '#6B625A', line: '#E3D8CB', accent: '#B4430F' },
  dark: { bg: '#26282C', ink: '#F4F1EC', muted: '#B3AEA6', line: '#43464C', accent: '#FFB27A' },
};

// Cắt giữa ảnh nguồn cho vừa khung đích (như object-fit: cover)
function drawCover(ctx, img, dx, dy, dw, dh) {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale;
  const sh = dh / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, dx, dy, dw, dh);
}

// Nhãn in hoa giãn chữ: JetBrains Mono vỡ dấu chồng (Ố, Ộ) trên canvas → dùng Be Vietnam Pro
const LABEL_FONT = '"Be Vietnam Pro", sans-serif';

// Rút gọn chữ cho vừa chiều rộng, thêm "…"
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * mapCanvas: ảnh chụp bản đồ; title: tên lớn; label: dòng mono phía trên (ngày);
 * stats: [[nhãn, giá trị], ...] tối đa 3 cột; dark: dùng màu tối. → Promise<Blob> PNG
 */
export async function drawPoster(mapCanvas, { title, label, stats, dark }) {
  const c = THEME[dark ? 'dark' : 'light'];
  // Canvas chỉ dùng được web font đã tải xong
  await Promise.all([
    document.fonts.load('400 72px "Playfair Display"'),
    document.fonts.load('500 26px "Be Vietnam Pro"'),
    document.fonts.load('600 20px "Be Vietnam Pro"'),
  ]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, mapCanvas, 0, 0, W, MAP_H);

  // Mép bản đồ chìm dần vào nền
  const fade = ctx.createLinearGradient(0, MAP_H - 120, 0, MAP_H);
  fade.addColorStop(0, `${c.bg}00`);
  fade.addColorStop(1, c.bg);
  ctx.fillStyle = fade;
  ctx.fillRect(0, MAP_H - 120, W, 120);

  const x = 64;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = c.muted;
  ctx.font = `500 22px ${LABEL_FONT}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(label.toUpperCase(), x, MAP_H + 20);

  // Tên dài: thu cỡ chữ từ 72 xuống 52 trước khi phải cắt
  ctx.fillStyle = c.ink;
  ctx.letterSpacing = '0px';
  let size = 72;
  do {
    ctx.font = `400 ${size}px "Playfair Display", serif`;
    size -= 4;
  } while (size >= 52 && ctx.measureText(title).width > W - 2 * x);
  ctx.fillText(fit(ctx, title, W - 2 * x), x, MAP_H + 104);

  // Hàng chỉ số: kẻ trên, vách giữa các cột
  const top = MAP_H + 150;
  const colW = (W - 2 * x) / 3;
  ctx.fillStyle = c.line;
  ctx.fillRect(x, top, W - 2 * x, 2);
  stats.slice(0, 3).forEach(([name, value], i) => {
    const cx = x + i * colW + (i ? 28 : 0);
    if (i) {
      ctx.fillStyle = c.line;
      ctx.fillRect(x + i * colW, top + 24, 2, 110);
    }
    ctx.fillStyle = c.muted;
    ctx.font = `500 20px ${LABEL_FONT}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(name.toUpperCase(), cx, top + 58);
    ctx.fillStyle = c.ink;
    ctx.font = '400 54px "Playfair Display", serif';
    ctx.letterSpacing = '0px';
    ctx.fillText(fit(ctx, value, colW - 36), cx, top + 124);
  });

  ctx.fillStyle = c.accent;
  ctx.font = `600 20px ${LABEL_FONT}`;
  ctx.letterSpacing = '6px';
  ctx.textAlign = 'right';
  ctx.fillText('HÀNH TRÌNH', W - x, H - 36);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh poster.'))), 'image/png'),
  );
}
