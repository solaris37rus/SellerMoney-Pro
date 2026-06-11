import { json, supabase, sendTelegram } from '../_shared/utils.js';

function helpText() {
  return `🚀 <b>SellerMoney Pro</b>\n\nЯ бот коммерческого продукта для селлеров маркетплейсов.\n\nКоманды:\n/calc 1490 520 18 110 10 7 — быстрый расчёт: цена, себестоимость, комиссия %, логистика, реклама %, возвраты %\n/support — связь с поддержкой\n/tariffs — тарифы\n\nПолный кабинет: откройте сайт SellerMoney Pro.`;
}
function calc(args) {
  const [price,cost,commission,logistics,ads,returns] = args.map(Number);
  if ([price,cost,commission,logistics,ads,returns].some(x => !Number.isFinite(x))) return 'Формат: /calc 1490 520 18 110 10 7';
  const tax = price * .06;
  const profit = price - cost - logistics - price*(commission/100) - price*(ads/100) - tax - (returns/100)*(logistics*.6);
  const margin = price ? profit/price*100 : 0;
  const status = profit < 0 ? '🔴 Убыточно' : margin < 8 ? '🟠 На грани' : '🟢 Прибыльно';
  return `${status}\nЧистая прибыль: <b>${Math.round(profit)} ₽</b>\nМаржа: <b>${margin.toFixed(1)}%</b>\n\nДля точного расчёта с хранением, упаковкой и сценариями откройте кабинет SellerMoney Pro.`;
}
export async function onRequestPost({ request, env }) {
  try {
    const update = await request.json();
    const msg = update.message || update.edited_message;
    if (!msg) return json({ ok: true });
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const from = msg.from || {};
    if (text.startsWith('/start')) {
      const payload = text.split(' ')[1] || '';
      if (payload.startsWith('pay_')) {
        await sendTelegram(env, chatId, `🧾 Заявка на оплату получена.\nOrder: <code>${payload.replace('pay_','')}</code>\n\nПоддержка скоро проверит оплату или пришлёт ссылку.\nVK: ${env.SUPPORT_VK || 'https://vk.com/bread1996'}\nEmail: ${env.SUPPORT_EMAIL || 'slava.plekhanov.2002@gmail.com'}`);
        await sendTelegram(env, env.ADMIN_TELEGRAM_CHAT_ID, `💬 Пользователь открыл ручную оплату\nChat: ${chatId}\nUser: @${from.username || '—'}\nOrder: ${payload.replace('pay_','')}`);
        return json({ ok: true });
      }
      if (payload.startsWith('link_')) {
        const code = payload.replace('link_', '');
        await supabase(env, `telegram_links?code=eq.${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed', telegram_chat_id: String(chatId), telegram_user: from, confirmed_at: new Date().toISOString() }) });
        await sendTelegram(env, chatId, '✅ Telegram привязан. Вернитесь в кабинет SellerMoney Pro.');
        return json({ ok: true });
      }
      await sendTelegram(env, chatId, helpText());
      return json({ ok: true });
    }
    if (text.startsWith('/calc')) {
      await sendTelegram(env, chatId, calc(text.split(/\s+/).slice(1)));
      return json({ ok: true });
    }
    if (text.startsWith('/tariffs')) {
      await sendTelegram(env, chatId, 'Тарифы SellerMoney Pro:\nFree — 0 ₽\nStart — 790 ₽/мес\nPro — 1 490 ₽/мес\nBusiness — 3 990 ₽/мес');
      return json({ ok: true });
    }
    if (text.startsWith('/support')) {
      await sendTelegram(env, chatId, `Поддержка:\nVK: ${env.SUPPORT_VK || 'https://vk.com/bread1996'}\nEmail: ${env.SUPPORT_EMAIL || 'slava.plekhanov.2002@gmail.com'}`);
      return json({ ok: true });
    }
    await sendTelegram(env, chatId, 'Напишите /calc для быстрого расчёта или /support для связи.');
    return json({ ok: true });
  } catch (e) { return json({ ok: false, error: e.message }, 500); }
}
