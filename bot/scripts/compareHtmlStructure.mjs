import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const oldFile = path.join(__dirname, '../../Parseinfo.html');
const newFile = path.join(__dirname, '../../ParseInfoNew.html');

const oldHtml = fs.readFileSync(oldFile, 'utf8');
const newHtml = fs.readFileSync(newFile, 'utf8');

console.log('=== Сравнение структуры HTML ===\n');

// Проверяем ключевые селекторы
const selectors = [
  'DefaultLine_line',
  'LinesGroup_group',
  'DefaultLine_teamsWrap',
  'DefaultLine_cell',
  'data-match-id',
  'data-line-id',
  'href="/line/',
  'LinesGroup_header',
  'LinesGroup_title',
  'DefaultLine_outcome',
  'DefaultLine_lineLink'
];

console.log('Наличие селекторов:');
selectors.forEach(selector => {
  const oldHas = oldHtml.includes(selector);
  const newHas = newHtml.includes(selector);
  const status = oldHas === newHas ? '✓' : '✗';
  console.log(`${status} ${selector}: старый=${oldHas}, новый=${newHas}`);
});

// Ищем новые классы в новом файле
console.log('\n=== Поиск новых классов в ParseInfoNew.html ===');
const classPattern = /class="([^"]+)"/g;
const newClasses = new Set();
let match;
while ((match = classPattern.exec(newHtml)) !== null) {
  const classes = match[1].split(/\s+/);
  classes.forEach(cls => {
    if (cls.includes('Line') || cls.includes('Group') || cls.includes('Match')) {
      newClasses.add(cls);
    }
  });
}

const oldClasses = new Set();
while ((match = classPattern.exec(oldHtml)) !== null) {
  const classes = match[1].split(/\s+/);
  classes.forEach(cls => {
    if (cls.includes('Line') || cls.includes('Group') || cls.includes('Match')) {
      oldClasses.add(cls);
    }
  });
}

console.log('\nКлассы только в новом файле:');
const onlyNew = Array.from(newClasses).filter(c => !oldClasses.has(c));
onlyNew.slice(0, 20).forEach(cls => console.log(`  - ${cls}`));

console.log('\nКлассы только в старом файле:');
const onlyOld = Array.from(oldClasses).filter(c => !newClasses.has(c));
onlyOld.slice(0, 20).forEach(cls => console.log(`  - ${cls}`));

// Проверяем структуру таблиц
console.log('\n=== Структура таблиц ===');
const oldTables = (oldHtml.match(/<table[^>]*>/g) || []).length;
const newTables = (newHtml.match(/<table[^>]*>/g) || []).length;
console.log(`Таблиц в старом: ${oldTables}`);
console.log(`Таблиц в новом: ${newTables}`);

// Проверяем структуру строк
const oldRows = (oldHtml.match(/<tr[^>]*>/g) || []).length;
const newRows = (newHtml.match(/<tr[^>]*>/g) || []).length;
console.log(`Строк <tr> в старом: ${oldRows}`);
console.log(`Строк <tr> в новом: ${newRows}`);
