# ⚡ Быстрый деплой - Шпаргалка

## 🎯 Вариант 1: Hostinger + Render (рекомендуется)

### 1. Hostinger (PHP + Frontend)

```bash
# 1. Подготовка файлов
node prepare-deploy.js

# 2. Загрузите через FTP в public_html/:
#    - api/
#    - web/
#    - admin/

# 3. В hPanel создайте MySQL БД

# 4. Импортируйте SQL файлы через phpMyAdmin:
#    - database.sql
#    - create_bets_table.sql
#    - add_credit_system.sql

# 5. Отредактируйте api/config.php:
#    DB_HOST = 'localhost'
#    DB_NAME = 'ваша_бд'
#    DB_USER = 'ваш_пользователь'
#    DB_PASS = 'ваш_пароль'
```

### 2. Render (Node.js Bot)

```bash
# 1. Создайте репозиторий на GitHub с папкой bot/

# 2. На Render.com:
#    - New → Web Service
#    - Подключите репозиторий
#    - Root Directory: bot
#    - Build: cd bot && npm install && npm run build
#    - Start: cd bot && node dist/index.js

# 3. Environment Variables:
#    BOT_TOKEN=ваш_токен
#    PORT=10000
#    PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
#    PUBLIC_ADMIN_URL=https://ваш-домен.com/admin
```

### 3. Обновление web/app.js

```javascript
// Найдите строку ~19-23 и измените:
const API_BASE = isProduction 
  ? "https://ваш-bot.onrender.com"  // URL Render сервиса
  : "http://localhost:3000";
```

### 4. Telegram Bot

```
/setmenubutton
⚽ Ставки - https://ваш-домен.com/web
🛠️ Админка - https://ваш-домен.com/admin
```

---

## 🎯 Вариант 2: Один VPS

### Быстрая установка

```bash
# 1. Установка компонентов
sudo apt update && sudo apt upgrade -y
sudo apt install nginx php-fpm php-mysql mysql-server nodejs npm -y
sudo npm install -g pm2

# 2. Загрузка файлов (через FileZilla/SFTP)
#    api/, web/, admin/ → /var/www/html/
#    bot/ → /home/user/betsbot/

# 3. База данных
sudo mysql
CREATE DATABASE betsbot_db;
CREATE USER 'betsbot'@'localhost' IDENTIFIED BY 'пароль';
GRANT ALL ON betsbot_db.* TO 'betsbot'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Импорт SQL
mysql -u betsbot -p betsbot_db < api/database.sql

# 4. Настройка Nginx (см. DEPLOY_GUIDE.md)

# 5. SSL
sudo certbot --nginx -d ваш-домен.com

# 6. Бот
cd /home/user/betsbot/bot
npm install
npm run build
# Создайте .env с BOT_TOKEN, PORT, URLs
pm2 start dist/index.js --name betsbot
pm2 save
```

---

## ✅ Чек-лист

- [ ] PHP API работает: `https://домен.com/api/matches.php`
- [ ] Frontend открывается: `https://домен.com/web`
- [ ] Node.js API работает: `https://render-url/health`
- [ ] Бот отвечает в Telegram
- [ ] WebApp кнопки работают
- [ ] HTTPS настроен

---

## 🔧 Быстрые команды

```bash
# Проверка бота (VPS)
pm2 logs betsbot
pm2 restart betsbot

# Проверка Nginx
sudo nginx -t
sudo systemctl reload nginx

# Проверка MySQL
sudo systemctl status mysql
```

---

📖 **Полная инструкция:** `DEPLOY_GUIDE.md`
