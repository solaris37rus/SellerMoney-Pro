import { bad, json, getUser, supabase } from '../_shared/utils.js';
export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return bad('Auth required', 401);
    const code = crypto.randomUUID().slice(0, 12);
    await supabase(env, 'telegram_links', { method: 'POST', body: JSON.stringify({ user_id: user.id, code, status: 'pending' }) });
    const bot = env.TELEGRAM_BOT_USERNAME || 'SellerMoney_Pro_bot';
    return json({ code, url: `https://t.me/${bot}?start=link_${code}` });
  } catch(e) { return bad(e.message || 'Telegram link error', 500); }
}
