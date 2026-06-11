import { bad, json, supabase, activateSubscription, sendTelegram } from '../_shared/utils.js';
export async function onRequestPost({ request, env }) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return bad('Unauthorized', 401);
    const { payment_id } = await request.json();
    if (!payment_id) return bad('payment_id required');
    const rows = await supabase(env, `payments?id=eq.${payment_id}&limit=1`, { method: 'GET' });
    const payment = rows?.[0];
    if (!payment) return bad('payment not found', 404);
    await supabase(env, `payments?id=eq.${payment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'succeeded', paid_at: new Date().toISOString(), metadata: { ...(payment.metadata || {}), manual: true } }) });
    await activateSubscription(env, payment);
    await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `✅ Ручная активация SellerMoney Pro\nПлан: ${payment.plan}\nEmail: ${payment.email || '—'}`);
    return json({ ok: true });
  } catch(e) { return bad(e.message || 'Activation error', 500); }
}
