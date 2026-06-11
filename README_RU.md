# SellerMoney Pro — коммерческая версия

Премиальный SaaS/PWA-продукт для селлеров маркетплейсов: расчёт чистой прибыли, маржи, ROI, точки безубыточности, сценариев скидок/рекламы, кабинет товаров, тарифы, платежи, Supabase, Cloudflare Pages Functions и Telegram-бот.

## Что уже готово

- Лендинг агрессивного marketplace-стиля.
- Собственный SVG-логотип SellerMoney Pro.
- Рабочий калькулятор прибыли WB/Ozon/Яндекс Маркета.
- Сценарии «что будет, если снизить цену / поднять рекламу / вырастут возвраты».
- Кабинет товаров: сохранение, поиск, фильтры, импорт/экспорт CSV.
- Supabase Auth: email + пароль, magic link.
- Supabase Postgres schema + RLS-политики.
- Платёжный endpoint `/api/create-checkout`.
- YooMoney форма оплаты + webhook проверки подписи HMAC-SHA256.
- Опциональная интеграция ЮKassa API.
- Telegram bot webhook: /start, /calc, /tariffs, /support, ручные оплаты, привязка Telegram.
- Админка `/admin.html` с ADMIN_TOKEN.
- PWA: manifest + service worker.
- Юридические страницы: privacy/terms.
- Cloudflare Pages-ready структура.

## Важная безопасность

Telegram bot token, Supabase service role key и платёжные секреты нельзя хранить в `index.html`, `config.js` или GitHub. Они должны быть только в Cloudflare Pages → Settings → Variables and Secrets.

В проекте нет вашего Telegram token в коде. Вставьте его в Cloudflare secret `TELEGRAM_BOT_TOKEN`.

## Быстрый локальный запуск

```bash
cd sellermoney-commercial
python -m http.server 8080
```

Откройте:

```text
http://localhost:8080
```

Так работает frontend и локальный демо-режим. Для API-функций нужен Wrangler:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

## Production launch checklist

1. Создать Supabase project.
2. Выполнить `supabase/schema.sql` в SQL Editor.
3. Скопировать Supabase Project URL и anon key в `config.js`.
4. Добавить Supabase service role key в Cloudflare secret.
5. Создать Cloudflare Pages project и залить файлы.
6. Добавить переменные окружения Cloudflare.
7. Настроить YooMoney или ЮKassa.
8. Настроить Telegram webhook.
9. Проверить `/api/health`.
10. Провести тестовую оплату.

## Публичные контакты уже добавлены

- VK: https://vk.com/bread1996
- Telegram bot: https://t.me/SellerMoney_Pro_bot
- Email: slava.plekhanov.2002@gmail.com

## Тарифы

- Free — 0 ₽, до 3 товаров.
- Start — 790 ₽/мес, до 25 товаров.
- Pro — 1 490 ₽/мес, до 300 товаров.
- Business — 3 990 ₽/мес, безлимит/команда.

## Файлы проекта

```text
index.html                 Главный продукт/лендинг/кабинет
styles.css                 Премиальный UI
app.js                     Калькулятор, кабинет, auth, payments
admin.html/admin.js        Админка
functions/api/*            Cloudflare Pages Functions
functions/_shared/utils.js Общие API-утилиты
supabase/schema.sql        База данных и RLS
legal/*                    Политика и соглашение
assets/logo.svg            Логотип
config.js                  Публичная frontend-конфигурация
.dev.vars.example          Пример секретов для Cloudflare/Wrangler
```

## Что физически нельзя сделать без личных кабинетов

- Создать Supabase project за вас.
- Подключить YooMoney/ЮKassa без номера кошелька/магазина и секретов.
- Включить webhook Telegram без деплой-домена.

Код полностью подготовлен: после вставки секретов и URL он станет рабочим коммерческим продуктом.
