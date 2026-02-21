# 📝 Примеры конфигураций для разных хостингов

## Hostinger

### api/config.php

```php
<?php
// Конфигурация базы данных
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456789_betsbot'); // Ваше имя БД из hPanel
define('DB_USER', 'u123456789_user'); // Ваш пользователь БД
define('DB_PASS', 'ваш_пароль_бд'); // Ваш пароль БД
define('DB_CHARSET', 'utf8mb4');
```

### bot/.env (для Render)

```env
BOT_TOKEN=ваш_токен_от_BotFather
PORT=10000
PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
PUBLIC_ADMIN_URL=https://ваш-домен.com/admin
NODE_ENV=production
```

---

## Timeweb

### api/config.php

```php
<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'c123456_betsbot'); // Обычно начинается с c + цифры
define('DB_USER', 'c123456_user');
define('DB_PASS', 'ваш_пароль');
define('DB_CHARSET', 'utf8mb4');
```

---

## Beget

### api/config.php

```php
<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456_betsbot'); // Обычно начинается с u + цифры
define('DB_USER', 'u123456_user');
define('DB_PASS', 'ваш_пароль');
define('DB_CHARSET', 'utf8mb4');
```

---

## REG.RU

### api/config.php

```php
<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456_betsbot');
define('DB_USER', 'u123456_user');
define('DB_PASS', 'ваш_пароль');
define('DB_CHARSET', 'utf8mb4');
```

---

## VPS (своя установка MySQL)

### api/config.php

```php
<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'betsbot_db');
define('DB_USER', 'betsbot_user');
define('DB_PASS', 'сильный_пароль_здесь');
define('DB_CHARSET', 'utf8mb4');
```

### bot/.env (на VPS)

```env
BOT_TOKEN=ваш_токен_от_BotFather
PORT=3000
PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
PUBLIC_ADMIN_URL=https://ваш-домен.com/admin
NODE_ENV=production
```

---

## web/app.js - настройка API

### Вариант 1: Прямое подключение к Render

```javascript
const API_BASE = isProduction 
  ? "https://betsbot-xxxx.onrender.com"
  : "http://localhost:3000";
```

### Вариант 2: Через прокси на хостинге

```javascript
const API_BASE = isProduction 
  ? window.location.origin + "/api/proxy.php?path=api"
  : "http://localhost:3000";
```

### Вариант 3: Node.js на том же домене (VPS)

```javascript
const API_BASE = isProduction 
  ? window.location.origin
  : "http://localhost:3000";
```

---

## bot/src/index.ts - CORS настройки

### Для одного домена

```typescript
app.use(
  cors({
    origin: "https://ваш-домен.com",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
```

### Для нескольких доменов

```typescript
app.use(
  cors({
    origin: [
      "https://ваш-домен.com",
      "https://www.ваш-домен.com",
      "http://localhost:5173" // для разработки
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
```

### Для разработки (небезопасно!)

```typescript
app.use(
  cors({
    origin: "*", // Разрешает все домены
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
```

---

## Nginx конфигурация (VPS)

### /etc/nginx/sites-available/betsbot

```nginx
server {
    listen 80;
    server_name ваш-домен.com www.ваш-домен.com;
    
    # Frontend
    location / {
        root /var/www/html/web;
        try_files $uri $uri/ /index.html;
    }
    
    # Admin
    location /admin {
        alias /var/www/html/admin;
        try_files $uri $uri/ /admin/index.html;
    }
    
    # PHP API
    location /api {
        root /var/www/html;
        try_files $uri $uri/ /api/index.php?$query_string;
        
        location ~ \.php$ {
            fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
            include fastcgi_params;
        }
    }
    
    # Node.js API (проксирование)
    location /api/w54 {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## PM2 конфигурация (VPS)

### Запуск бота

```bash
cd /home/user/betsbot/bot
pm2 start dist/index.js --name betsbot
pm2 save
pm2 startup
```

### Полезные команды

```bash
pm2 list              # Список процессов
pm2 logs betsbot      # Логи бота
pm2 restart betsbot   # Перезапуск
pm2 stop betsbot     # Остановка
pm2 delete betsbot   # Удаление
```

---

## Проверка работы

### PHP API

```bash
curl https://ваш-домен.com/api/matches.php
```

Должен вернуться JSON.

### Node.js API

```bash
curl https://ваш-bot.onrender.com/health
# или
curl http://localhost:3000/health
```

Должен вернуться `{"status":"ok"}` или подобное.

### Frontend

Откройте в браузере:
```
https://ваш-домен.com/web
```

Должен загрузиться интерфейс.

---

## 🔒 Безопасность

### Не загружайте в Git:

- `.env` файлы
- `api/config.php` с реальными паролями
- `node_modules/`
- Базы данных (`.db` файлы)

### Используйте .gitignore:

```gitignore
.env
.env.local
.env.production
api/config.php
node_modules/
dist/
data/
*.db
*.log
```

---

## 📞 Поддержка

Если что-то не работает:

1. Проверьте логи: `pm2 logs betsbot` (для бота)
2. Проверьте конфигурацию БД в `api/config.php`
3. Убедитесь, что HTTPS настроен (обязательно для Telegram WebApp)
4. Проверьте CORS настройки в `bot/src/index.ts`
5. Убедитесь, что все URL правильные в `.env` файле бота
