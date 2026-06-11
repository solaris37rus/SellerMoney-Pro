import { bad, json, supabase, hmacSha256Hex, yoomoneySignatureBase, activateSubscription, sendTelegram } from '../_shared/utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    if (!contentType.includes('application/x-www-form-urlencoded') && !params.get('notification_type')) return bad('Expected form-urlencoded');
    const received = params.get('sign');
    if (!received) return bad('Missing sign', 401);
    if (!env.YOOMONEY_NOTIFICATION_SECRET) return bad('YOOMONEY_NOTIFICATION_SECRET is not configured', 500);
    const base = yoomoneySignatureBase(params);
    const expected = await hmacSha256Hex(env.YOOMONEY_NOTIFICATION_SECRET, base);
    if (expected !== received) return bad('Invalid signature', 401);
    if (params.get('codepro') === 'true' || params.get('unaccepted') === 'true') return json({ ok: true, ignored: true });
    const label = params.get('label') || '';
    const amount = Number(params.get('amount') || 0);
    const rows = await supabase(env, `payments?label=eq.${encodeURIComponent(label)}&limit=1`, { method: 'GET' });
    const payment = rows?.[0];
    if (!payment) return json({ ok: true, warning: 'payment_not_found' });
    await supabase(env, `payments?id=eq.${payment.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'succeeded', external_id: params.get('operation_id'), paid_at: new Date().toISOString(), metadata: { yoomoney: Object.fromEntries(params.entries()), received_amount: amount } }) });
    await activateSubscription(env, payment);
    await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `✅ Оплата YooMoney подтверждена\nПлан: ${payment.plan}\nСумма: ${amount} ₽\nEmail: ${payment.email || '—'}`);
    return json({ ok: true });
  } catch (e) { return bad(e.message || 'Webhook error', 500); }
}
