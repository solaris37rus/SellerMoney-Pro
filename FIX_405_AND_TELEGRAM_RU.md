# Исправление 405 и регистрация через Telegram

Эта сборка содержит корневой `_worker.js`. Именно он обрабатывает:

- `POST /api/create-checkout`
- `POST /api/telegram-webhook`
- `POST /api/link-telegram`
- `GET /api/health`

Ошибка `405 Method Not Allowed` возникала потому, что Cloudflare отдавал `/api/create-checkout` как статический путь, а backend-функция не была подключена. В этой сборке API работает через `_worker.js`, поэтому важно загрузить его в корень сайта.

## Как загрузить

В Cloudflare Pages → Deployments → Create deployment / Upload assets загружайте содержимое папки, а не ZIP.

В корне после загрузки обязательно должны быть:

```text
_worker.js
index.html
app.html
config.js
app.js
styles.css
assets/
supabase/
```

## Проверка

Откройте:

```text
https://sellermoney-pro.pages.dev/api/health
```

Должно быть:

```json
{"ok":true,"service":"SellerMoney Pro API","mode":"advanced-worker"}
```

Если там 404 или 405 — значит `_worker.js` не попал в корень деплоя.

## SQL для Telegram-регистрации

Если старая база уже создана, выполните в Supabase SQL Editor файл:

```text
supabase/telegram_users_migration.sql
```

Если база ещё не создавалась, можно выполнить полный:

```text
supabase/schema.sql
```

## Webhook Telegram

```text
https://api.telegram.org/bot<НОВЫЙ_ТОКЕН>/setWebhook?url=https://sellermoney-pro.pages.dev/api/telegram-webhook
```

После этого `/start` в боте создаёт/обновляет запись в `public.telegram_users` и сохраняет:

- telegram_id
- chat_id
- username
- first_name
- last_name
- language_code
- raw Telegram profile
