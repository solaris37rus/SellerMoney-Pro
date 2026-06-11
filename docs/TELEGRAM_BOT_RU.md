# Telegram-бот SellerMoney Pro

Бот: @SellerMoney_Pro_bot

## Возможности

- `/start` — приветствие.
- `/calc 1490 520 18 110 10 7` — быстрый расчёт прибыли.
- `/tariffs` — тарифы.
- `/support` — контакты поддержки.
- `/start pay_ORDER_ID` — ручная оплата/заявка.
- `/start link_CODE` — привязка Telegram к аккаунту.

## Настройка webhook

После деплоя выполните в браузере или терминале:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://ВАШ-ДОМЕН/api/telegram-webhook"
```

Токен храните только в Cloudflare Secret `TELEGRAM_BOT_TOKEN`.

## Проверка

Напишите боту:

```text
/calc 1490 520 18 110 10 7
```

Он должен вернуть прибыль, маржу и статус товара.
