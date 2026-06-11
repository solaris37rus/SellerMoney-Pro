# Деплой на Cloudflare Pages

## 1. Загрузка проекта

Вариант А — через GitHub:
1. Создайте приватный репозиторий.
2. Загрузите содержимое папки `sellermoney-commercial`.
3. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
4. Build command оставить пустым или `echo no-build`.
5. Build output directory: `/`.

Вариант Б — через Wrangler:

```bash
npm install
npx wrangler pages project create sellermoney-pro
npx wrangler pages deploy . --project-name=sellermoney-pro
```

## 2. Переменные и секреты

Cloudflare → Workers & Pages → ваш Pages project → Settings → Variables and Secrets.

Добавьте:

```text
PUBLIC_BASE_URL=https://ваш-домен.pages.dev
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
PAYMENT_PROVIDER=yoomoney
YOOMONEY_RECEIVER=номер_кошелька
YOOMONEY_NOTIFICATION_SECRET=секрет_http_уведомлений
TELEGRAM_BOT_USERNAME=SellerMoney_Pro_bot
TELEGRAM_BOT_TOKEN=токен_бота
ADMIN_TOKEN=длинный_случайный_токен
SUPPORT_EMAIL=slava.plekhanov.2002@gmail.com
SUPPORT_VK=https://vk.com/bread1996
```

## 3. Проверка

Откройте:

```text
https://ваш-домен.pages.dev/api/health
```

Должен быть ответ:

```json
{"ok":true}
```

## 4. Админка

```text
https://ваш-домен.pages.dev/admin.html
```

Вставьте `ADMIN_TOKEN`.
