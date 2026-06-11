import { PLANS, bad, json, readJson, getUser, supabase, originFrom, sendTelegram } from '../_shared/utils.js';

export async function onRequestOptions() { return json({ ok: true }); }

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const planKey = String(body.plan || '').toLowerCase();
    const plan = PLANS[planKey];
    if (!plan) return bad('Unknown plan');
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return bad('Email is required');
    const user = await getUser(request, env);
    const orderId = crypto.randomUUID();
    const origin = originFrom(request, env);
    const label = `SM-${planKey}-${orderId.slice(0, 18)}`.slice(0, 64);
    const paymentRows = await supabase(env, 'payments', {
      method: 'POST',
      body: JSON.stringify({ id: orderId, user_id: user?.id || null, email, plan: planKey, amount: plan.amount, currency: 'RUB', status: 'pending', provider: env.PAYMENT_PROVIDER || 'yoomoney', label, metadata: { source: 'site' } })
    });
    const payment = paymentRows?.[0];

    if ((env.PAYMENT_PROVIDER || 'yoomoney') === 'yookassa' && env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY) {
      const auth = btoa(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`);
      const yk = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Basic ${auth}`, 'Idempotence-Key': orderId },
        body: JSON.stringify({
          amount: { value: plan.amount.toFixed(2), currency: 'RUB' },
          capture: true,
          confirmation: { type: 'redirect', return_url: `${origin}/?payment=success&order=${orderId}` },
          description: `SellerMoney Pro ${plan.title} на 30 дней`,
          metadata: { order_id: orderId, plan: planKey, email, user_id: user?.id || '' }
        })
      });
      const data = await yk.json();
      if (!yk.ok) return bad(data.description || data.error || 'YooKassa error', 502);
      await supabase(env, `payments?id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({ external_id: data.id, metadata: { yookassa: data } }) });
      return json({ provider: 'yookassa', payment_id: orderId, payment_url: data.confirmation?.confirmation_url });
    }

    if (env.YOOMONEY_RECEIVER) {
      return json({
        provider: 'yoomoney',
        payment_id: orderId,
        payment_form: {
          method: 'POST',
          action: 'https://yoomoney.ru/quickpay/confirm',
          params: {
            receiver: env.YOOMONEY_RECEIVER,
            'quickpay-form': 'button',
            paymentType: 'AC',
            sum: plan.amount.toFixed(2),
            label,
            targets: `SellerMoney Pro ${plan.title}`,
            successURL: `${origin}/?payment=success&order=${orderId}`
          }
        }
      });
    }

    await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `🧾 Новый pending-платёж SellerMoney Pro\nПлан: ${plan.title}\nСумма: ${plan.amount} ₽\nEmail: ${email}\nOrder: ${orderId}`);
    const bot = env.TELEGRAM_BOT_USERNAME || 'SellerMoney_Pro_bot';
    return json({ provider: 'manual', payment_id: orderId, manual_url: `https://t.me/${bot}?start=pay_${orderId}` });
  } catch (e) {
    return bad(e.message || 'Checkout error', 500);
  }
}
