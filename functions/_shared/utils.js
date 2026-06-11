export const PLANS = {
  start: { title: 'Start', amount: 790, days: 30, limit: 25 },
  pro: { title: 'Pro', amount: 1490, days: 30, limit: 300 },
  business: { title: 'Business', amount: 3990, days: 30, limit: 999999 }
};
export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra } });
}
export function bad(error, status = 400) { return json({ error }, status); }
export async function readJson(request) { try { return await request.json(); } catch { return {}; } }
export function originFrom(request, env) { return env.PUBLIC_BASE_URL || new URL(request.url).origin; }
export async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json();
}
export async function supabase(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not configured');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) } });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'object' ? JSON.stringify(data) : text);
  return data;
}
export async function sendTelegram(env, chatId, text, extra = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return null;
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }) });
}
export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function rfc3986(str) { return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`); }
export function yoomoneySignatureBase(params) {
  return [...params.entries()].filter(([k]) => k !== 'sign').sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${rfc3986(v)}`).join('&');
}
export async function activateSubscription(env, payment) {
  const plan = PLANS[payment.plan];
  if (!plan) return;
  const now = new Date();
  const until = new Date(now.getTime() + plan.days * 24 * 3600 * 1000).toISOString();
  if (payment.user_id) {
    await supabase(env, `profiles?id=eq.${payment.user_id}`, { method: 'PATCH', body: JSON.stringify({ plan: payment.plan, plan_until: until, updated_at: now.toISOString() }) });
    await supabase(env, 'subscriptions', { method: 'POST', body: JSON.stringify({ user_id: payment.user_id, plan: payment.plan, status: 'active', started_at: now.toISOString(), ends_at: until, payment_id: payment.id }) });
  }
}
