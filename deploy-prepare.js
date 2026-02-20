/**
 * Скрипт для подготовки к развертыванию
 * Запуск: node deploy-prepare.js
 * 
 * Этот скрипт поможет подготовить файлы для загрузки на хостинг
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Подготовка к развертыванию BetsBot...\n');

// Список файлов и папок, которые НЕ нужно загружать
const excludePatterns = [
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  'dist',
  '*.log',
  '*.db',
  'testing.html',
  'Parseinfo.html',
  'ParseInfoNew.html',
  'w54rjjmb.html',
  'output.html',
  'test-*.js',
  'test-*.mjs',
  '*.bat',
  'scripts',
  'src', // TypeScript исходники, нужен только dist
  'tsconfig.json',
  'package-lock.json'
];

// Файлы, которые нужно обновить для продакшена
const filesToUpdate = {
  'web/app.js': {
    search: /const API_BASE = ["']http:\/\/localhost:3000["'];?/,
    replace: (domain) => `const API_BASE = window.location.origin; // Production: ${domain}`
  }
};

function createDeployList() {
  console.log('📋 Создание списка файлов для развертывания...\n');
  
  const deployList = {
    webHosting: {
      description: 'Файлы для веб-хостинга (PHP + Frontend)',
      folders: [
        { src: 'api', dest: 'api', note: 'Все PHP файлы' },
        { src: 'web', dest: 'web', note: 'Frontend приложение' },
        { src: 'admin', dest: 'admin', note: 'Админ панель' }
      ],
      files: [
        { src: 'api/database.sql', dest: 'api/database.sql', note: 'SQL для импорта в phpMyAdmin' },
        { src: 'api/create_bets_table.sql', dest: 'api/create_bets_table.sql' },
        { src: 'api/add_credit_system.sql', dest: 'api/add_credit_system.sql' },
        { src: 'api/add_currency_to_deposits.sql', dest: 'api/add_currency_to_deposits.sql' }
      ]
    },
    vpsServer: {
      description: 'Файлы для VPS сервера (Node.js бот)',
      folders: [
        { src: 'bot/dist', dest: 'bot/dist', note: 'Скомпилированный JavaScript' },
        { src: 'bot/package.json', dest: 'bot/package.json', note: 'Зависимости' }
      ],
      note: 'ВАЖНО: После загрузки выполните на сервере:\n  cd bot\n  npm install --production\n  npm run build (если dist нет)'
    }
  };

  // Сохраняем список в файл
  const output = JSON.stringify(deployList, null, 2);
  fs.writeFileSync('deploy-list.json', output, 'utf8');
  
  console.log('✅ Создан файл deploy-list.json\n');
  console.log('📦 Структура для развертывания:\n');
  console.log(JSON.stringify(deployList, null, 2));
  
  return deployList;
}

function createEnvTemplate() {
  console.log('\n📝 Создание шаблона .env для продакшена...\n');
  
  const envTemplate = `# Production Environment Variables
# Создайте этот файл на VPS сервере в папке bot/

BOT_TOKEN=ваш_токен_от_BotFather
PORT=3000

# URL вашего веб-приложения (HTTPS обязательно для Telegram WebApp!)
PUBLIC_WEBAPP_URL=https://ваш-домен.com/web
PUBLIC_ADMIN_URL=https://ваш-домен.com/admin

# Опционально: настройки Puppeteer
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# NODE_ENV=production
`;

  fs.writeFileSync('bot/.env.production.example', envTemplate, 'utf8');
  console.log('✅ Создан файл bot/.env.production.example\n');
}

function createDeployScript() {
  console.log('\n📜 Создание скрипта для VPS...\n');
  
  const deployScript = `#!/bin/bash
# Скрипт для развертывания бота на VPS
# Использование: bash deploy-bot.sh

echo "🚀 Развертывание BetsBot..."

cd bot

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install --production

# Сборка TypeScript (если нужно)
if [ ! -d "dist" ]; then
  echo "🔨 Сборка TypeScript..."
  npm run build
fi

# Проверка .env файла
if [ ! -f ".env" ]; then
  echo "⚠️  ВНИМАНИЕ: Файл .env не найден!"
  echo "Создайте файл .env на основе .env.production.example"
  exit 1
fi

# Установка PM2 (если еще не установлен)
if ! command -v pm2 &> /dev/null; then
  echo "📦 Установка PM2..."
  npm install -g pm2
fi

# Остановка старого процесса (если есть)
pm2 stop betsbot 2>/dev/null || true
pm2 delete betsbot 2>/dev/null || true

# Запуск бота
echo "▶️  Запуск бота..."
pm2 start dist/index.js --name betsbot

# Сохранение конфигурации
pm2 save

echo "✅ Бот развернут!"
echo "📊 Проверка статуса: pm2 status"
echo "📋 Логи: pm2 logs betsbot"
`;

  fs.writeFileSync('deploy-bot.sh', deployScript, 'utf8');
  
  // Создаем также Windows версию
  const deployScriptWin = `@echo off
REM Скрипт для развертывания бота на Windows (для тестирования)
REM Использование: deploy-bot-win.bat

echo 🚀 Развертывание BetsBot...

cd bot

REM Установка зависимостей
echo 📦 Установка зависимостей...
call npm install

REM Сборка TypeScript
echo 🔨 Сборка TypeScript...
call npm run build

REM Проверка .env файла
if not exist ".env" (
    echo ⚠️  ВНИМАНИЕ: Файл .env не найден!
    echo Создайте файл .env на основе .env.production.example
    pause
    exit /b 1
)

echo ✅ Готово к запуску!
echo Запуск: npm start
pause
`;

  fs.writeFileSync('deploy-bot-win.bat', deployScriptWin, 'utf8');
  
  console.log('✅ Созданы скрипты:');
  console.log('   - deploy-bot.sh (для Linux VPS)');
  console.log('   - deploy-bot-win.bat (для Windows)\n');
}

function main() {
  try {
    createDeployList();
    createEnvTemplate();
    createDeployScript();
    
    console.log('\n✨ Подготовка завершена!\n');
    console.log('📖 Следующие шаги:');
    console.log('1. Прочитайте DEPLOYMENT.md для подробных инструкций');
    console.log('2. Настройте api/config.php с данными вашей БД');
    console.log('3. Создайте .env файл на VPS на основе bot/.env.production.example');
    console.log('4. Загрузите файлы на хостинг согласно deploy-list.json');
    console.log('5. Запустите deploy-bot.sh на VPS сервере\n');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

main();
