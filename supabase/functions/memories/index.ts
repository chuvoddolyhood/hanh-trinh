// Edge Function (Deno): gửi Web Push "Ngày này năm trước" cho người có nơi đã đến vào ngày này các năm trước.
// Viết bằng JavaScript thuần (file .ts chỉ vì Supabase CLI mặc định tìm index.ts).
//
// Deploy:  supabase functions deploy memories --no-verify-jwt
// Secret:  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
// Gọi mỗi sáng bằng pg_cron + pg_net (câu lệnh trong README), header x-cron-secret phải khớp CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const TZ = 'Asia/Ho_Chi_Minh';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT'),
  Deno.env.get('VAPID_PUBLIC_KEY'),
  Deno.env.get('VAPID_PRIVATE_KEY'),
);

// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY có sẵn trong môi trường Edge Function
const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

// Ngày hôm nay theo giờ Việt Nam → { year, month, day }
function today() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date())
      .map((p) => [p.type, Number(p.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

function message(names, years) {
  const oldest = Math.min(...years);
  const first = names[0];
  const more = names.length > 1 ? ` và ${names.length - 1} nơi khác` : '';
  return {
    title: 'Ngày này năm trước',
    body: `${first}${more}, ${years.length > 1 ? `từ năm ${oldest}` : `năm ${oldest}`}.`,
    url: '/?memories=1',
  };
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const { year, month, day } = today();
  const { data: rows, error } = await db.rpc('memories_on', { p_year: year, p_month: month, p_day: day });
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const row of rows) {
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', row.user_id);
    const payload = JSON.stringify(message(row.names, row.years));
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent += 1;
      } catch (e) {
        // 404/410: người dùng đã tắt thông báo hoặc gỡ app → xoá đăng ký
        if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
  }
  return Response.json({ users: rows.length, sent });
});
