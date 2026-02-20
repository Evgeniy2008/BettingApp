# 🚀 Быстрый старт: Hostinger + Render

## Краткая инструкция

### 1️⃣ Hostinger (5 минут)

1. **Загрузите файлы через File Manager:**
   - `api/` → `public_html/api/`
   - `web/` → `public_html/web/`
   - `admin/` → `public_html/admin/`

2. **Обновите `api/config.php`:**
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'ваше_имя_бд');
   define('DB_USER', 'ваш_пользователь');
   define('DB_PASS', 'ваш_пароль');
   ```

3. **Создайте БД в phpMyAdmin и импортируйте `api/database.sql`**

4. **Проверьте:** `https://ваш-домен.com/api/matches.php`

---

### 2️⃣ Render (10 минут)

1. **Войдите на [render.com](https://render.com)** через GitHub

2. **New + → Web Service**

3. **Подключите репозиторий** (или загрузите папку `bot/`)

4. **Настройки:**
   ```
   Name: betsbot
   Environment: Node
   Build Command: cd bot && npm install && npm run build
   Start Command: cd bot && node dist/index.js
   ```

5. **Environment Variables:**
   ```
   BOT_TOKEN=ваш_токен
   PORT=10000
   PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
   PUBLIC_ADMIN_URL=https://ваш-домен.com/admin
   ```

6. **Create Web Service** → ждите деплой (2-5 мин)

7. **Скопируйте URL:** `https://betsbot-xxxx.onrender.com`

---

### 3️⃣ Связывание (2 минуты)

**Вариант A: Прямое подключение (проще)**

В `web/app.js` найдите и замените:
```javascript
const RENDER_API_URL = window.location.origin;
```
на:
```javascript
const RENDER_API_URL = "https://betsbot-xxxx.onrender.com"; // Ваш Render URL
```

Загрузите обновленный `web/app.js` на Hostinger.

**Вариант B: Через прокси (рекомендуется)**

1. Обновите `api/proxy.php` - укажите ваш Render URL
2. Загрузите `api/proxy.php` на Hostinger
3. В `web/app.js` используйте:
   ```javascript
   const RENDER_API_URL = window.location.origin + "/api/proxy.php?path=api";
   ```

---

### 4️⃣ Telegram (1 минута)

1. Откройте [@BotFather](https://t.me/BotFather)
2. `/setmenubutton` → выберите бота
3. Добавьте:
   - `⚽ Ставки - https://ваш-домен.com/web`
   - `🛠️ Админка - https://ваш-домен.com/admin`

---

### 5️⃣ Пробуждение Render (опционально)

Чтобы Render не "засыпал" на Free тарифе:

1. Обновите `api/ping-render.php` - укажите ваш Render URL
2. Загрузите на Hostinger
3. В hPanel → Cron Jobs:
   - Команда: `php /home/ваш_пользователь/public_html/api/ping-render.php`
   - Частота: `*/10 * * * *` (каждые 10 минут)

---

## ✅ Проверка

- [ ] `https://ваш-домен.com/web` - открывается интерфейс
- [ ] `https://ваш-домен.com/api/matches.php` - возвращает JSON
- [ ] `https://betsbot-xxxx.onrender.com/health` - возвращает `{"ok":true}`
- [ ] Бот в Telegram → `/start` → кнопки работают

---

## 📖 Подробная инструкция

Смотрите `DEPLOY_HOSTINGER_RENDER.md` для деталей.
