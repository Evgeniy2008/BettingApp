# 🛠️ Подготовка файлов перед развертыванием

## Что нужно сделать перед загрузкой

### 1. Обновите web/app.js

**Найдите строку 19 и замените:**
```javascript
// Было:
const RENDER_API_URL = window.location.origin;

// Должно быть (после получения Render URL):
const RENDER_API_URL = "https://betsbot-xxxx.onrender.com"; // Ваш Render URL!
```

**Или оставьте как есть** и обновите после получения Render URL.

---

### 2. Обновите api/config.php

**После создания БД на 000webhost обновите:**
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'id12345678_betsbot'); // Ваше имя БД
define('DB_USER', 'id12345678_user'); // Ваш пользователь
define('DB_PASS', 'ваш_пароль'); // Ваш пароль
```

---

### 3. Проверьте bot/.gitignore

Убедитесь, что файл содержит:
```
node_modules/
dist/
.env
.env.local
*.log
*.db
```

---

### 4. Список файлов для загрузки

#### На 000webhost (через File Manager или FTP):

**Папка api/:**
- Все `.php` файлы
- Все `.sql` файлы (для импорта)

**Папка web/:**
- `index.html`
- `app.js` (обновить Render URL!)
- `wallet.js`
- `styles.css`
- Все остальные файлы

**Папка admin/:**
- `index.html`
- `app.js`
- `styles.css`
- `styles_enhancements.css`
- Все остальные файлы

#### На GitHub (для Render):

**Только папка bot/:**
- `src/`
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `render.yaml` (опционально)
- `fly.toml` (опционально)

**НЕ загружайте:**
- `node_modules/`
- `dist/` (соберется на Render)
- `.env` файлы
- `*.db` файлы

---

### 5. Порядок действий

1. ✅ Сначала загрузите бота на Render (получите URL)
2. ✅ Затем обновите `web/app.js` с Render URL
3. ✅ Затем загрузите все на 000webhost
4. ✅ Настройте БД и обновите `api/config.php`
5. ✅ Проверьте работу

---

## 📝 Шаблоны для копирования

### Render Environment Variables:
```
BOT_TOKEN=ваш_токен_от_BotFather
PORT=10000
PUBLIC_WEBAPP_URL=https://ваш-сайт.000webhostapp.com/web
PUBLIC_ADMIN_URL=https://ваш-сайт.000webhostapp.com/admin
NODE_ENV=production
```

### api/config.php:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'id12345678_betsbot');
define('DB_USER', 'id12345678_user');
define('DB_PASS', 'ваш_пароль');
define('DB_CHARSET', 'utf8mb4');
```

### web/app.js (строка 19):
```javascript
const RENDER_API_URL = "https://betsbot-xxxx.onrender.com";
```

---

## ✅ Готово к развертыванию!

После подготовки следуйте инструкции:
- **CHECKLIST_DEPLOY.md** - пошаговый чек-лист
- **DEPLOY_FULL_FREE.md** - подробная инструкция
