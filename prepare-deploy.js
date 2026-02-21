#!/usr/bin/env node

/**
 * Скрипт для подготовки файлов к развертыванию
 * Удаляет ненужные файлы и создает архив для загрузки
 */

const fs = require('fs');
const path = require('path');

const filesToExclude = [
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  'dist',
  'data',
  '*.log',
  '*.db',
  'testing.html',
  'Parseinfo.html',
  'ParseInfoNew.html',
  'w54rjjmb.html',
  'output.html',
  'detailedInfo.html',
  'betsList.html',
  'fixtureTemplate.json',
  'package-lock.json',
  'tsconfig.json',
  'fly.toml',
  'render.yaml',
  'deploy-bot.sh',
  'deploy-prepare.js',
  'prepare-deploy.md',
  'run_parse.bat',
  'test-api-browser.js',
  'test-api.mjs',
  'parse_w54_simple.js',
  'CHECKLIST_DEPLOY.md',
  'DEPLOY_24_7_FREE.md',
  'DEPLOY_FREE_DEMO.md',
  'DEPLOY_FULL_FREE.md',
  'DEPLOY_HOSTINGER_RENDER.md',
  'DEPLOYMENT.md',
  'DEPLOY_GUIDE.md',
  'QUICK_DEMO.md',
  'QUICK_START_HOSTINGER_RENDER.md',
  'QUICK_START.md',
  'README_DEMO.md',
  'README.md',
  'PARSING_SOURCES.md',
  'PAYMENT_SYSTEM_README.md',
  'nginx-example.conf',
  '.gitignore',
];

console.log('🚀 Подготовка файлов к развертыванию...\n');

// Создаем папку для деплоя
const deployDir = path.join(__dirname, 'deploy');
if (fs.existsSync(deployDir)) {
  console.log('Очистка старой папки deploy...');
  fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir, { recursive: true });

// Копируем нужные папки
const foldersToCopy = ['api', 'web', 'admin', 'bot'];

foldersToCopy.forEach(folder => {
  const sourcePath = path.join(__dirname, folder);
  const destPath = path.join(deployDir, folder);
  
  if (fs.existsSync(sourcePath)) {
    console.log(`📁 Копирование папки ${folder}...`);
    copyFolder(sourcePath, destPath, folder);
  } else {
    console.log(`⚠️  Папка ${folder} не найдена, пропускаем...`);
  }
});

console.log('\n✅ Готово! Файлы подготовлены в папке deploy/');
console.log('\n📋 Следующие шаги:');
console.log('1. Для PHP хостинга: загрузите папки api/, web/, admin/');
console.log('2. Для Render/VPS: загрузите папку bot/');
console.log('3. Не забудьте настроить config.php и .env файлы!');
console.log('\n📖 Подробная инструкция в файле DEPLOY_GUIDE.md');

function copyFolder(src, dest, folderName) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Пропускаем исключенные файлы
    if (shouldExclude(entry.name, folderName)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Рекурсивно копируем папки
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'data') {
        // Для bot/ копируем только dist после сборки
        if (folderName === 'bot' && entry.name === 'dist') {
          console.log(`   ⚠️  Пропускаем ${entry.name}/ (нужно собрать через npm run build)`);
        } else {
          console.log(`   ⚠️  Пропускаем ${entry.name}/`);
        }
        continue;
      }
      copyFolder(srcPath, destPath, folderName);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function shouldExclude(fileName, folderName) {
  // Исключаем файлы из списка
  for (const pattern of filesToExclude) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      if (regex.test(fileName)) {
        return true;
      }
    } else if (fileName === pattern) {
      return true;
    }
  }

  // Для bot/ исключаем исходники TypeScript, оставляем только dist
  if (folderName === 'bot') {
    if (fileName.endsWith('.ts') && !fileName.includes('dist')) {
      return true;
    }
    if (fileName === 'tsconfig.json') {
      return true;
    }
  }

  return false;
}
