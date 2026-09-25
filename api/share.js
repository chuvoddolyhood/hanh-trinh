// Link chia sẻ /s/<token> (rewrite trong vercel.json): trả index.html kèm thẻ Open Graph
// để Zalo, Facebook, Messenger hiện ảnh bìa và tên chuyến (bot không chạy JavaScript).
import { getSharedTrip, summarize } from './_trip.js';

export const config = { runtime: 'edge' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default async function handler(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  const [html, data] = await Promise.all([
    fetch(new URL('/index.html', url)).then((r) => r.text()),
    getSharedTrip(token),
  ]);

  let page = html;
  if (data) {
    const s = summarize(data);
    const title = `${s.name} · Hành trình`;
    const description = `${s.range}, ${s.stats.join(', ')}`;
    const image = `${url.origin}/api/og?t=${encodeURIComponent(token)}`;
    const meta = [
      ['property', 'og:type', 'article'],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:image', image],
      ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '630'],
      ['property', 'og:url', `${url.origin}/s/${token}`],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'description', description],
    ].map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}">`).join('\n    ');
    page = html
      .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`)
      .replace('</head>', `    ${meta}\n  </head>`);
  }

  return new Response(page, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
    },
  });
}
