// SellerMoney Pro — Cloudflare Pages Advanced Mode Worker
// Root _worker.js fixes 405 on Direct Upload: API routes are handled here, static files by env.ASSETS.

const PLANS = {
  start: { title: 'Start', amount: 790, days: 30, limit: 25 },
  pro: { title: 'Pro', amount: 1490, days: 30, limit: 300 },
  business: { title: 'Business', amount: 3990, days: 30, limit: 999999 }
};

function apiHeaders(extra = {}) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    ...extra
  };
}
function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: apiHeaders(extra) }); }
function bad(error, status = 400) { return json({ ok: false, error }, status); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function originFrom(request, env) { return env.PUBLIC_BASE_URL || new URL(request.url).origin; }
function sanitizeUsername(v) { return String(v || '').replace(/^@/, '').trim() || null; }
function tgProfile(from = {}, chatId, payload = '') {
  return {
    telegram_id: String(from.id || chatId),
    chat_id: String(chatId || from.id),
    username: sanitizeUsername(from.username),
    first_name: from.first_name || null,
    last_name: from.last_name || null,
    language_code: from.language_code || null,
    is_bot: !!from.is_bot,
    source_payload: payload || null,
    raw: from || {},
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json();
}

async function supabase(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not configured in Cloudflare Secrets');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'object' ? JSON.stringify(data) : (text || `Supabase ${res.status}`));
  return data;
}
async function supabaseMaybe(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try { return await supabase(env, path, options); } catch (e) { console.log('Supabase optional error:', e.message); return null; }
}

async function sendTelegram(env, chatId, text, extra = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return null;
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })
  });
}

async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function rfc3986(str) { return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`); }
function yoomoneySignatureBase(params) { return [...params.entries()].filter(([k]) => k !== 'sign').sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${rfc3986(v)}`).join('&'); }

async function upsertTelegramUser(env, from, chatId, payload = '') {
  const row = tgProfile(from, chatId, payload);
  return supabaseMaybe(env, 'telegram_users?on_conflict=telegram_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
}

async function activateSubscription(env, payment) {
  const plan = PLANS[payment.plan];
  if (!plan) return;
  const now = new Date();
  const until = new Date(now.getTime() + plan.days * 24 * 3600 * 1000).toISOString();
  if (payment.user_id) {
    await supabase(env, `profiles?id=eq.${payment.user_id}`, { method: 'PATCH', body: JSON.stringify({ plan: payment.plan, plan_until: until, updated_at: now.toISOString() }) });
    await supabase(env, 'subscriptions', { method: 'POST', body: JSON.stringify({ user_id: payment.user_id, plan: payment.plan, status: 'active', started_at: now.toISOString(), ends_at: until, payment_id: payment.id }) });
  }
}

async function createCheckout(request, env) {
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

    await supabaseMaybe(env, 'payments', {
      method: 'POST',
      body: JSON.stringify({ id: orderId, user_id: user?.id || null, email, plan: planKey, amount: plan.amount, currency: 'RUB', status: 'pending', provider: env.PAYMENT_PROVIDER || 'yoomoney', label, metadata: { source: 'site', deploy: 'advanced-worker' } })
    });

    if ((env.PAYMENT_PROVIDER || 'yoomoney') === 'yookassa' && env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY) {
      const auth = btoa(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`);
      const yk = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Basic ${auth}`, 'Idempotence-Key': orderId },
        body: JSON.stringify({ amount: { value: plan.amount.toFixed(2), currency: 'RUB' }, capture: true, confirmation: { type: 'redirect', return_url: `${origin}/?payment=success&order=${orderId}` }, description: `SellerMoney Pro ${plan.title} на 30 дней`, metadata: { order_id: orderId, plan: planKey, email, user_id: user?.id || '' } })
      });
      const data = await yk.json();
      if (!yk.ok) return bad(data.description || data.error || 'YooKassa error', 502);
      await supabaseMaybe(env, `payments?id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({ external_id: data.id, metadata: { yookassa: data } }) });
      return json({ ok: true, provider: 'yookassa', payment_id: orderId, payment_url: data.confirmation?.confirmation_url });
    }

    if (env.YOOMONEY_RECEIVER) {
      return json({ ok: true, provider: 'yoomoney', payment_id: orderId, payment_form: { method: 'POST', action: 'https://yoomoney.ru/quickpay/confirm', params: { receiver: env.YOOMONEY_RECEIVER, 'quickpay-form': 'button', paymentType: 'AC', sum: plan.amount.toFixed(2), label, targets: `SellerMoney Pro ${plan.title}`, successURL: `${origin}/?payment=success&order=${orderId}` } } });
    }

    const bot = env.TELEGRAM_BOT_USERNAME || 'SellerMoney_Pro_bot';
    await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `🧾 Новый pending-платёж SellerMoney Pro\nПлан: ${plan.title}\nСумма: ${plan.amount} ₽\nEmail: ${email}\nOrder: ${orderId}`);
    return json({ ok: true, provider: 'manual', payment_id: orderId, manual_url: `https://t.me/${bot}?start=pay_${orderId}` });
  } catch (e) { return bad(e.message || 'Checkout error', 500); }
}

function welcomeText(from = {}) {
  const username = from.username ? `@${from.username}` : 'без username';
  const site = 'https://sellermoney-pro.pages.dev/app.html';
  return `✅ <b>Вы зарегистрированы в SellerMoney Pro</b>\n\nTelegram: <b>${username}</b>\nВаш Telegram ID сохранён в базе.\n\nТеперь можно открыть кабинет и считать прибыль товаров.\n\nКоманды:\n/profile — проверить запись\n/tariffs — тарифы\n/support — поддержка`;
}
function calc(args) {
  const [price,cost,commission,logistics,ads,returns] = args.map(Number);
  if ([price,cost,commission,logistics,ads,returns].some(x => !Number.isFinite(x))) return 'Формат: /calc 1490 520 18 110 10 7';
  const tax = price * .06;
  const profit = price - cost - logistics - price*(commission/100) - price*(ads/100) - tax - (returns/100)*(logistics*.6);
  const margin = price ? profit/price*100 : 0;
  const status = profit < 0 ? '🔴 Убыточно' : margin < 8 ? '🟠 На грани' : '🟢 Прибыльно';
  return `${status}\nЧистая прибыль: <b>${Math.round(profit)} ₽</b>\nМаржа: <b>${margin.toFixed(1)}%</b>`;
}

async function telegramWebhook(request, env) {
  try {
    const update = await request.json();
    const msg = update.message || update.edited_message;
    if (!msg) return json({ ok: true });
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const from = msg.from || {};
    const payload = text.startsWith('/start') ? (text.split(' ')[1] || 'register') : '';

    if (text.startsWith('/start') || text.startsWith('/register')) {
      await upsertTelegramUser(env, from, chatId, payload || 'register');

      if (payload.startsWith('pay_')) {
        const order = payload.replace('pay_', '');
        await supabaseMaybe(env, 'audit_events', { method: 'POST', body: JSON.stringify({ event: 'telegram_payment_opened', payload: { telegram_id: String(from.id || chatId), username: from.username || null, order } }) });
        await sendTelegram(env, chatId, `✅ Вы зарегистрированы в базе SellerMoney Pro.\n\n🧾 Заявка на оплату получена.\nOrder: <code>${order}</code>\n\nПоддержка проверит оплату или пришлёт ссылку.\nVK: ${env.SUPPORT_VK || 'https://vk.com/bread1996'}\nEmail: ${env.SUPPORT_EMAIL || 'slava.plekhanov.2002@gmail.com'}`);
        await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `💬 Пользователь открыл ручную оплату\nChat: ${chatId}\nUser: @${from.username || '—'}\nOrder: ${order}`);
        return json({ ok: true });
      }

      if (payload.startsWith('link_')) {
        const code = payload.replace('link_', '');
        const rows = await supabaseMaybe(env, `telegram_links?code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed', telegram_chat_id: String(chatId), telegram_user: from, confirmed_at: new Date().toISOString() }) });
        const link = Array.isArray(rows) ? rows[0] : null;
        if (link?.user_id) {
          await supabaseMaybe(env, `profiles?id=eq.${link.user_id}`, { method: 'PATCH', body: JSON.stringify({ telegram_chat_id: String(chatId), telegram_user: from }) });
          await supabaseMaybe(env, `telegram_users?telegram_id=eq.${String(from.id || chatId)}`, { method: 'PATCH', body: JSON.stringify({ linked_user_id: link.user_id, updated_at: new Date().toISOString() }) });
        }
        await sendTelegram(env, chatId, '✅ Telegram зарегистрирован и привязан к аккаунту SellerMoney Pro. Вернитесь в кабинет.');
        return json({ ok: true });
      }

      await sendTelegram(env, chatId, welcomeText(from), { reply_markup: { inline_keyboard: [[{ text: 'Открыть кабинет', url: `${env.PUBLIC_BASE_URL || 'https://sellermoney-pro.pages.dev'}/app.html` }], [{ text: 'Тарифы', url: `${env.PUBLIC_BASE_URL || 'https://sellermoney-pro.pages.dev'}/#pricing` }]] } });
      return json({ ok: true });
    }

    if (text.startsWith('/profile')) {
      await upsertTelegramUser(env, from, chatId, 'profile');
      await sendTelegram(env, chatId, `👤 <b>Ваш профиль сохранён</b>\nTelegram ID: <code>${from.id || chatId}</code>\nUsername: <b>${from.username ? '@' + from.username : 'не указан'}</b>\nИмя: <b>${[from.first_name, from.last_name].filter(Boolean).join(' ') || 'не указано'}</b>`);
      return json({ ok: true });
    }
    if (text.startsWith('/email')) {
      const email = text.split(/\s+/)[1] || '';
      if (!email.includes('@')) { await sendTelegram(env, chatId, 'Формат: /email you@example.com'); return json({ ok: true }); }
      await upsertTelegramUser(env, from, chatId, 'email');
      await supabaseMaybe(env, `telegram_users?telegram_id=eq.${String(from.id || chatId)}`, { method: 'PATCH', body: JSON.stringify({ email, updated_at: new Date().toISOString() }) });
      await sendTelegram(env, chatId, `✅ Email сохранён: <b>${email}</b>`);
      return json({ ok: true });
    }
    if (text.startsWith('/calc')) { await sendTelegram(env, chatId, calc(text.split(/\s+/).slice(1))); return json({ ok: true }); }
    if (text.startsWith('/tariffs')) { await sendTelegram(env, chatId, 'Тарифы SellerMoney Pro:\nFree — 0 ₽\nStart — 790 ₽/мес\nPro — 1 490 ₽/мес\nBusiness — 3 990 ₽/мес'); return json({ ok: true }); }
    if (text.startsWith('/support')) { await sendTelegram(env, chatId, `Поддержка:\nVK: ${env.SUPPORT_VK || 'https://vk.com/bread1996'}\nEmail: ${env.SUPPORT_EMAIL || 'slava.plekhanov.2002@gmail.com'}`); return json({ ok: true }); }
    await sendTelegram(env, chatId, 'Напишите /start для регистрации, /profile для проверки профиля или /support для связи.');
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: e.message }, 500); }
}

async function linkTelegram(request, env) {
  try {
    const user = await getUser(request, env);
    if (!user) return bad('Auth required', 401);
    const code = crypto.randomUUID().slice(0, 12);
    await supabase(env, 'telegram_links', { method: 'POST', body: JSON.stringify({ user_id: user.id, code, status: 'pending' }) });
    const bot = env.TELEGRAM_BOT_USERNAME || 'SellerMoney_Pro_bot';
    return json({ ok: true, code, url: `https://t.me/${bot}?start=link_${code}` });
  } catch(e) { return bad(e.message || 'Telegram link error', 500); }
}

async function adminStats(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return bad('Unauthorized', 401);
    const [profiles, products, payments, telegramUsers] = await Promise.all([
      supabase(env, 'profiles?select=id,email,plan'),
      supabase(env, 'products?select=id'),
      supabase(env, 'payments?select=*&order=created_at.desc&limit=50'),
      supabase(env, 'telegram_users?select=telegram_id,username,created_at')
    ]);
    const paid = payments.filter(p => p.status === 'succeeded');
    const mrr = paid.reduce((s,p)=>s+Number(p.amount||0),0);
    return json({ ok: true, users: profiles.length, products: products.length, telegram_users: telegramUsers.length, paid_payments: paid.length, mrr, recent_payments: payments });
  } catch(e) { return bad(e.message || 'Admin error', 500); }
}

async function manualActivate(request, env) {
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

async function yoomoneyWebhook(request, env) {
  try {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    if (!params.get('notification_type')) return bad('Expected YooMoney form notification');
    const received = params.get('sign');
    if (!received) return bad('Missing sign', 401);
    if (!env.YOOMONEY_NOTIFICATION_SECRET) return bad('YOOMONEY_NOTIFICATION_SECRET is not configured', 500);
    const expected = await hmacSha256Hex(env.YOOMONEY_NOTIFICATION_SECRET, yoomoneySignatureBase(params));
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

async function yookassaWebhook(request, env) {
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

function methodNotAllowed(allowed) { return json({ ok: false, error: 'Method Not Allowed', allowed }, 405, { Allow: allowed.join(', ') }); }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/api/') && request.method === 'OPTIONS') return json({ ok: true });
    if (path === '/api/health') return json({ ok: true, service: 'SellerMoney Pro API', mode: 'advanced-worker', ts: new Date().toISOString(), telegram_registration: true });
    if (path === '/api/create-checkout') { if (request.method !== 'POST') return methodNotAllowed(['POST','OPTIONS']); return createCheckout(request, env); }
    if (path === '/api/telegram-webhook') { if (request.method !== 'POST') return methodNotAllowed(['POST','OPTIONS']); return telegramWebhook(request, env); }
    if (path === '/api/link-telegram') { if (request.method !== 'POST') return methodNotAllowed(['POST','OPTIONS']); return linkTelegram(request, env); }
    if (path === '/api/admin-stats') { if (request.method !== 'GET') return methodNotAllowed(['GET','OPTIONS']); return adminStats(request, env); }
    if (path === '/api/manual-activate') { if (request.method !== 'POST') return methodNotAllowed(['POST','OPTIONS']); return manualActivate(request, env); }
    if (path === '/api/yoomoney-webhook') { if (request.method !== 'POST') return methodNotAllowed(['POST','OPTIONS']); return yoomoneyWebhook(request, env); }
    if (path === '/api/yookassa-webhook') { if (request.method !== 'POST') return methodNotAllowed(['POST','OPTIONS']); return yookassaWebhook(request, env); }
    if (path.startsWith('/api/')) return bad('API route not found', 404);
    return env.ASSETS.fetch(request);
  }
};
