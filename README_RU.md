# SellerMoney Pro — production package

Готовая коммерческая сборка: лендинг, PWA-кабинет, Supabase Auth/DB, Cloudflare Pages Functions, Telegram-бот, YooMoney/YooKassa-ready backend.

## Что уже настроено в коде

- Контакты: VK https://vk.com/bread1996, Telegram @SellerMoney_Pro_bot, email slava.plekhanov.2002@gmail.com
- Supabase frontend config: `config.js` и inline fallback в `index.html`
- Пользовательские товары сохраняются только после входа в аккаунт
- Демо-товары и подсказки владельцу удалены с витрины
- Публичная витрина готова к показу клиентам

## Файлы для загрузки в Cloudflare Pages

Загружайте содержимое этой папки целиком: `index.html`, `styles.css`, `app.js`, `config.js`, `functions/`, `assets/`, `legal/`, `supabase/`.

## Обязательные Cloudflare secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_TOKEN`

Для оплаты через YooMoney добавьте:

- `YOOMONEY_RECEIVER`
- `YOOMONEY_NOTIFICATION_SECRET`

Для ручных уведомлений админу добавьте:

- `ADMIN_TELEGRAM_CHAT_ID`
- `TELEGRAM_BOT_USERNAME=SellerMoney_Pro_bot`
- `SUPPORT_EMAIL=slava.plekhanov.2002@gmail.com`
- `SUPPORT_VK=https://vk.com/bread1996`

## Supabase

Выполните SQL из `supabase/schema.sql` в SQL Editor. Затем в Authentication → URL Configuration добавьте:

- Site URL: `https://sellermoney-pro.pages.dev`
- Redirect URL: `https://sellermoney-pro.pages.dev/*`
- Redirect URL для локалки: `http://localhost:8080/*`

## Локальная проверка

```bash
python -m http.server 8080
```

Откройте: `http://localhost:8080`
