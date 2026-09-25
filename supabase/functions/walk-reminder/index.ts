// Edge Function (Deno): nhắc lúc 20:00 (giờ Việt Nam) cho người bật "Nhắc mục tiêu đi bộ" mà hôm nay chưa đi đủ.
// Viết bằng JavaScript thuần (file .ts chỉ vì Supabase CLI mặc định tìm index.ts).
//
// Deploy:  supabase functions deploy walk-reminder --no-verify-jwt
// Dùng chung secret với memories (VAPID_*, CRON_SECRET). Lịch pg_cron: xem README.
import { allowed, db, sendToUser, today } from '../_shared/push.ts';

const km = (n) => String(Number(n)).replace('.', ',');

Deno.serve(async (req) => {
  if (!allowed(req)) return new Response('Forbidden', { status: 403 });

  const { data: rows, error } = await db.rpc('walk_reminders', { p_date: today().iso });
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const r of rows) {
    const left = Math.max(0, Number(r.goal_km) - Number(r.walked_km)).toFixed(1);
    sent += await sendToUser(r.user_id, {
      title: 'Mục tiêu đi bộ hôm nay',
      body: Number(r.walked_km) > 0
        ? `Bạn đã đi ${km(r.walked_km)} km, còn ${km(left)} km nữa là đạt ${km(r.goal_km)} km.`
        : `Hôm nay bạn chưa đi bộ. Đi ${km(r.goal_km)} km để giữ chuỗi ngày nhé.`,
      url: '/',
    });
  }
  return Response.json({ users: rows.length, sent });
});
