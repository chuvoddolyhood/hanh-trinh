// Edge Function (Deno): gửi Web Push "Ngày này năm trước" cho người có nơi đã đến vào ngày này các năm trước.
// Viết bằng JavaScript thuần (file .ts chỉ vì Supabase CLI mặc định tìm index.ts).
//
// Deploy:  supabase functions deploy memories --no-verify-jwt
// Secret:  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=...
// Gọi mỗi sáng bằng pg_cron + pg_net (câu lệnh trong README), header x-cron-secret phải khớp CRON_SECRET.
import { allowed, db, sendToUser, today } from '../_shared/push.ts';

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
  if (!allowed(req)) return new Response('Forbidden', { status: 403 });

  const { year, month, day } = today();
  const { data: rows, error } = await db.rpc('memories_on', { p_year: year, p_month: month, p_day: day });
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const row of rows) sent += await sendToUser(row.user_id, message(row.names, row.years));
  return Response.json({ users: rows.length, sent });
});
