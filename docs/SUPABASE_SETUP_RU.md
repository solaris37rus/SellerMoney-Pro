# Настройка Supabase

1. Создайте проект Supabase.
2. Откройте SQL Editor.
3. Скопируйте и выполните файл `supabase/schema.sql`.
4. Откройте Project Settings → API.
5. Скопируйте:
   - Project URL;
   - anon public key;
   - service_role secret key.
6. Вставьте Project URL и anon key в `config.js`.
7. Service role key добавьте только в Cloudflare Secrets.

## Auth

Email/password auth в Supabase включён по умолчанию. Рекомендуется:

- включить email confirmations после тестов;
- добавить Redirect URL вашего домена Cloudflare;
- настроить SMTP позже, когда будут первые клиенты.

## RLS

В `schema.sql` включены Row Level Security policies:

- пользователь видит только свои товары;
- пользователь может редактировать только свои товары;
- платежи создаются через серверную функцию;
- service role используется только на Cloudflare backend.
