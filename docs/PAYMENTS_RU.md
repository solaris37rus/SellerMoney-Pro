# Платежи: YooMoney и ЮKassa

## Вариант 1 — YooMoney

Это быстрее для старта, особенно если нужно протестировать первые оплаты.

Нужно получить:

```text
YOOMONEY_RECEIVER=номер кошелька ЮMoney
YOOMONEY_NOTIFICATION_SECRET=секрет HTTP-уведомлений
```

В Cloudflare выставить:

```text
PAYMENT_PROVIDER=yoomoney
```

Webhook URL для YooMoney:

```text
https://ваш-домен/api/yoomoney-webhook
```

После оплаты YooMoney отправляет уведомление, функция проверяет подпись HMAC-SHA256, ищет платеж по label и активирует подписку.

## Вариант 2 — ЮKassa

Это более «правильный» вариант для полноценного бизнеса/ИП/ООО, чеков и масштабирования.

Нужно получить:

```text
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_WEBHOOK_TOKEN=любой ваш секрет для защиты endpoint
```

В Cloudflare выставить:

```text
PAYMENT_PROVIDER=yookassa
```

Webhook URL:

```text
https://ваш-домен/api/yookassa-webhook
```

## Ручной fallback

Если платежные секреты не настроены, checkout отправит пользователя в Telegram-бота для ручной оплаты/активации. Это нужно только на этапе теста.
