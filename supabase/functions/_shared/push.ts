// Dùng chung cho các Edge Function gửi Web Push (memories, walk-reminder). JavaScript thuần trong file .ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

export const TZ = 'Asia/Ho_Chi_Minh';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT'),
  Deno.env.get('VAPID_PUBLIC_KEY'),
  Deno.env.get('VAPID_PRIVATE_KEY'),
);

// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY có sẵn trong môi trường Edge Function
export const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

// pg_cron gọi kèm header x-cron-secret phải khớp CRON_SECRET
export const allowed = (req) => req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET');

// Ngày hôm nay theo giờ Việt Nam → { year, month, day, iso: 'YYYY-MM-DD' }
export function today() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)]),
  );
  const pad = (n) => String(n).padStart(2, '0');
  return { ...parts, iso: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` };
}

// Gửi tới mọi thiết bị đã đăng ký của một người → số thông báo đã gửi.
// 404/410: người dùng đã tắt thông báo hoặc gỡ app → xoá đăng ký
export async function sendToUser(userId, message) {
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  const payload = JSON.stringify(message);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent += 1;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
    }
  }
  return sent;
}
