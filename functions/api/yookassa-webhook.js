import { bad, json, supabase, activateSubscription, sendTelegram } from '../_shared/utils.js';

export async function onRequestPost({ request, env }) {
  try {
    if (env.YOOKASSA_WEBHOOK_TOKEN) {
      const auth = request.headers.get('Authorization') || '';
      if (auth !== `Bearer ${env.YOOKASSA_WEBHOOK_TOKEN}`) return bad('Unauthorized', 401);
    }
    const event = await request.json();
    const object = event.object || {};
    const meta = object.metadata || {};
    const orderId = meta.order_id;
    if (!orderId) return json({ ok: true, ignored: 'missing_order_id' });
    const rows = await supabase(env, `payments?id=eq.${orderId}&limit=1`, { method: 'GET' });
    const payment = rows?.[0];
    if (!payment) return json({ ok: true, warning: 'payment_not_found' });
    const status = event.event === 'payment.succeeded' || object.status === 'succeeded' ? 'succeeded' : object.status || 'pending';
    await supabase(env, `payments?id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({ status, external_id: object.id || payment.external_id, paid_at: status === 'succeeded' ? new Date().toISOString() : null, metadata: { yookassa_webhook: event } }) });
    if (status === 'succeeded') await activateSubscription(env, payment);
    if (status === 'succeeded') await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `✅ Оплата ЮKassa подтверждена\nПлан: ${payment.plan}\nСумма: ${payment.amount} ₽\nEmail: ${payment.email || '—'}`);
    return json({ ok: true });
  } catch (e) { return bad(e.message || 'YooKassa webhook error', 500); }
}
