# 🚀 Полное руководство по развертыванию BetsBot

## 📋 Что нужно развернуть

Ваше приложение состоит из 3 компонентов:

1. **PHP Backend** (`api/`) - API для ставок, авторизации, кошелька
2. **Node.js Bot** (`bot/`) - Telegram бот + парсинг матчей
3. **Frontend** (`web/`, `admin/`) - веб-интерфейсы

---

## 🎯 Вариант 1: Простой (Hostinger + Render)

### Часть 1: PHP + Frontend на Hostinger

#### Шаг 1: Подготовка файлов

1. **Соберите файлы для загрузки:**
   ```
   api/
     ├── config.php (нужно будет настроить!)
     ├── *.php (все PHP файлы)
   web/
     ├── index.html
     ├── app.js
     ├── wallet.js
     └── styles.css
   admin/
     ├── index.html
     ├── app.js
     └── styles.css
   ```

#### Шаг 2: Загрузка на Hostinger

1. Войдите в **hPanel** (панель Hostinger)
2. Откройте **File Manager** или используйте **FTP** (FileZilla)
3. Загрузите файлы в `public_html/`:
   ```
   public_html/
   ├── api/
   ├── web/
   └── admin/
   ```

#### Шаг 3: Настройка базы данных

1. В hPanel откройте **MySQL Databases**
2. Создайте новую базу данных (например, `betsbot_db`)
3. Создайте пользователя и назначьте права
4. Запомните: **имя БД**, **пользователь**, **пароль**

#### Шаг 4: Импорт SQL

1. Откройте **phpMyAdmin** в hPanel
2. Выберите вашу базу данных
3. Импортируйте файлы по порядку:
   - `api/database.sql` (основная структура)
   - `api/create_bets_table.sql`
   - `api/add_credit_system.sql`
   - `api/add_currency_to_deposits.sql`
   - Остальные миграции при необходимости

#### Шаг 5: Настройка config.php

Откройте `api/config.php` и измените:

```php
define('DB_HOST', 'localhost'); // Обычно localhost на Hostinger
define('DB_NAME', 'u123456789_betsbot'); // Ваше имя БД из панели
define('DB_USER', 'u123456789_user'); // Ваш пользователь БД
define('DB_PASS', 'ваш_пароль'); // Ваш пароль БД
```

#### Шаг 6: Проверка

Откройте в браузере: `https://ваш-домен.com/api/matches.php`
- Должен вернуться JSON (может быть пустым, но без ошибок)

---

### Часть 2: Node.js Bot на Render

#### Шаг 1: Подготовка репозитория

**Вариант A: Через GitHub (рекомендуется)**

1. Создайте репозиторий на GitHub
2. Загрузите папку `bot/` в репозиторий
3. Или создайте отдельный репозиторий только для бота

**Вариант B: Прямая загрузка**

Можно загрузить файлы напрямую через интерфейс Render

#### Шаг 2: Создание сервиса на Render

1. Войдите на [render.com](https://render.com) (можно через GitHub)
2. Нажмите **"New +"** → **"Web Service"**
3. Подключите ваш репозиторий (или загрузите файлы)

4. **Настройки сервиса:**
   ```
   Name: betsbot
   Environment: Node
   Region: Frankfurt (или ближайший к вам)
   Branch: main (или master)
   Root Directory: bot (если репозиторий корневой, или оставьте пустым если только bot/)
   Build Command: cd bot && npm install && npm run build
   Start Command: cd bot && node dist/index.js
   ```

5. **Переменные окружения (Environment Variables):**
   ```
   BOT_TOKEN=ваш_токен_от_BotFather
   PORT=10000
   PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
   PUBLIC_ADMIN_URL=https://ваш-домен.com/admin
   NODE_ENV=production
   ```

6. Нажмите **"Create Web Service"**
7. Дождитесь деплоя (обычно 2-5 минут)
8. Получите URL сервиса: `https://betsbot-xxxx.onrender.com`

#### Шаг 3: Обновление CORS в боте

В файле `bot/src/index.ts` убедитесь, что CORS разрешает ваш домен:

```typescript
app.use(
  cors({
    origin: [
      "https://ваш-домен.com",
      "https://www.ваш-домен.com",
      "http://localhost:5173", // для локальной разработки
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
```

---

### Часть 3: Связывание компонентов

#### Обновление Frontend (web/app.js)

В файле `web/app.js` найдите и измените:

```javascript
// Найти эту строку (около строки 19-23):
const API_BASE = isProduction 
  ? "http://localhost:3000"  // ИЗМЕНИТЬ НА:
  : "http://localhost:3000";

// Должно быть:
const API_BASE = isProduction 
  ? "https://betsbot-xxxx.onrender.com"  // URL вашего Render сервиса!
  : "http://localhost:3000";
```

**Или используйте прокси через Hostinger** (удобнее для CORS):

1. Создайте файл `api/proxy.php` на Hostinger:
```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$renderUrl = 'https://betsbot-xxxx.onrender.com';
$path = $_GET['path'] ?? '';
$query = $_SERVER['QUERY_STRING'] ?? '';

$url = $renderUrl . '/' . $path;
if ($query && strpos($path, '?') === false) {
    $url .= '?' . $query;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($httpCode);
echo $response;
```

2. Тогда в `web/app.js`:
```javascript
const API_BASE = isProduction 
  ? window.location.origin + "/api/proxy.php?path=api"
  : "http://localhost:3000";
```

---

### Часть 4: Настройка Telegram бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/setmenubutton`
3. Выберите вашего бота
4. Добавьте кнопки:
   ```
   ⚽ Ставки - https://ваш-домен.com/web
   🛠️ Админка - https://ваш-домен.com/admin
   ```

---

## 🎯 Вариант 2: Все на одном VPS

Если у вас есть VPS сервер (например, Timeweb VPS, Selectel, DigitalOcean):

### Шаг 1: Подготовка сервера

1. Подключитесь к серверу по SSH
2. Установите необходимые компоненты:

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Nginx
sudo apt install nginx -y

# Установка PHP и расширений
sudo apt install php-fpm php-mysql php-curl php-json php-mbstring -y

# Установка MySQL
sudo apt install mysql-server -y

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2 для автозапуска бота
sudo npm install -g pm2
```

### Шаг 2: Загрузка файлов

1. Используйте FileZilla (SFTP) или SCP для загрузки файлов
2. Загрузите в структуру:
   ```
   /var/www/html/
   ├── api/
   ├── web/
   └── admin/
   
   /home/user/betsbot/
   └── bot/
   ```

### Шаг 3: Настройка базы данных

```bash
# Войдите в MySQL
sudo mysql

# Создайте базу данных
CREATE DATABASE betsbot_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Создайте пользователя
CREATE USER 'betsbot_user'@'localhost' IDENTIFIED BY 'ваш_пароль';
GRANT ALL PRIVILEGES ON betsbot_db.* TO 'betsbot_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Импортируйте SQL файлы:
```bash
mysql -u betsbot_user -p betsbot_db < api/database.sql
mysql -u betsbot_user -p betsbot_db < api/create_bets_table.sql
# и т.д.
```

### Шаг 4: Настройка Nginx

Создайте файл `/etc/nginx/sites-available/betsbot`:

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

Активируйте конфигурацию:
```bash
sudo ln -s /etc/nginx/sites-available/betsbot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 5: Настройка SSL (обязательно!)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d ваш-домен.com -d www.ваш-домен.com
```

### Шаг 6: Настройка бота

```bash
cd /home/user/betsbot/bot
npm install
npm run build

# Создайте .env файл
nano .env
```

Содержимое `.env`:
```
BOT_TOKEN=ваш_токен_от_BotFather
PORT=3000
PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
PUBLIC_ADMIN_URL=https://ваш-домен.com/admin
NODE_ENV=production
```

Запустите бота:
```bash
pm2 start dist/index.js --name betsbot
pm2 save
pm2 startup
```

---

## 📋 Чек-лист развертывания

### PHP + Frontend:
- [ ] Загружены папки `api/`, `web/`, `admin/`
- [ ] Обновлен `api/config.php` с данными БД
- [ ] Создана MySQL база данных
- [ ] Импортированы SQL файлы
- [ ] Проверен доступ к `https://ваш-домен.com/api/matches.php`
- [ ] Настроен SSL (HTTPS)

### Node.js Bot:
- [ ] Создан сервис на Render (или настроен на VPS)
- [ ] Настроены переменные окружения
- [ ] Указан правильный Build Command
- [ ] Указан правильный Start Command
- [ ] Сервис успешно задеплоен
- [ ] Проверен доступ к API

### Связывание:
- [ ] Обновлен `web/app.js` с URL Node.js API
- [ ] Настроен CORS в `bot/src/index.ts`
- [ ] Протестирован доступ Frontend к Node.js API

### Telegram:
- [ ] Настроены кнопки в BotFather
- [ ] Протестирован бот в Telegram
- [ ] WebApp кнопки открываются корректно

---

## ⚠️ Важные моменты

1. **HTTPS обязателен** для Telegram WebApp! Без HTTPS кнопки не будут работать.

2. **Render Free Tier ограничения:**
   - Сервис "засыпает" после 15 минут неактивности
   - Первый запрос после простоя может занять 30-60 секунд
   - Для продакшена лучше использовать Paid Plan ($7/месяц)

3. **Безопасность:**
   - Не загружайте `.env` файлы в Git
   - Используйте сильные пароли для БД
   - Настройте файрвол на VPS

4. **Производительность:**
   - Node.js бот использует Puppeteer (Chrome), что требует ресурсов
   - Рекомендуется минимум 2GB RAM на VPS для бота

---

## 🆘 Решение проблем

### Бот не запускается:
```bash
# Проверьте логи
pm2 logs betsbot

# Проверьте, что порт свободен
netstat -tulpn | grep 3000
```

### API не отвечает:
- Проверьте, что Node.js процесс запущен: `pm2 list`
- Проверьте файрвол: `sudo ufw status`
- Проверьте логи: `pm2 logs betsbot`

### Telegram WebApp не открывается:
- Убедитесь, что используется HTTPS
- Проверьте настройки в BotFather
- Проверьте URL в `.env` файле бота

### Ошибки подключения к БД:
- Проверьте настройки в `api/config.php`
- Убедитесь, что MySQL сервер доступен
- Проверьте права пользователя БД

---

## 💰 Стоимость

**Вариант 1 (Hostinger + Render Free):**
- Hostinger: от ~$2-5/месяц
- Render Free: бесплатно (с ограничениями)
- **Итого:** от $2/месяц

**Вариант 1 (Hostinger + Render Paid):**
- Hostinger: от ~$2-5/месяц
- Render Paid: $7/месяц
- **Итого:** от $9/месяц

**Вариант 2 (VPS):**
- VPS: от ~$5-10/месяц (зависит от провайдера)
- **Итого:** от $5/месяц

---

## 🎉 Готово!

После выполнения всех шагов ваше приложение будет работать:
- ✅ PHP API на хостинге
- ✅ Frontend на хостинге
- ✅ Node.js бот на Render или VPS
- ✅ Все связано и работает!
