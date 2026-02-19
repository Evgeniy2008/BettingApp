import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newFile = path.join(__dirname, '../../ParseInfoNew.html');
const html = fs.readFileSync(newFile, 'utf8');

const $ = cheerio.load(html);

console.log('=== Анализ ParseInfoNew.html ===\n');

// Проверяем ключевые селекторы
console.log('1. Таблицы:');
const tables = $("table[class*='LinesGroup_group']");
console.log(`   Найдено таблиц: ${tables.length}`);

if (tables.length === 0) {
  console.log('   ⚠️ Таблиц не найдено! Ищем альтернативы...');
  const allTables = $('table');
  console.log(`   Всего таблиц: ${allTables.length}`);
  if (allTables.length > 0) {
    const firstTable = allTables.first();
    const classes = firstTable.attr('class') || '';
    console.log(`   Классы первой таблицы: ${classes}`);
  }
}

console.log('\n2. Строки матчей:');
const matchRows = $("tr[class*='DefaultLine_line']");
console.log(`   Найдено строк с DefaultLine_line: ${matchRows.length}`);

if (matchRows.length === 0) {
  console.log('   ⚠️ Строк не найдено! Ищем альтернативы...');
  const allRows = $('tr');
  console.log(`   Всего строк <tr>: ${allRows.length}`);
  
  // Проверяем первые несколько строк
  allRows.slice(0, 5).each((i, el) => {
    const $row = $(el);
    const classes = $row.attr('class') || '';
    const hasTeams = $row.find("div[class*='DefaultLine_teamsWrap'], div[class*='teamsWrap']").length > 0;
    const hasOutcomes = $row.find("button[data-outcome-alias], button[data-odd]").length > 0;
    console.log(`   Строка ${i + 1}: классы="${classes.substring(0, 100)}", hasTeams=${hasTeams}, hasOutcomes=${hasOutcomes}`);
  });
}

console.log('\n3. Команды:');
const teamsWrap = $("div[class*='DefaultLine_teamsWrap']");
console.log(`   Найдено обёрток команд: ${teamsWrap.length}`);

if (teamsWrap.length === 0) {
  console.log('   ⚠️ Обёрток команд не найдено! Ищем альтернативы...');
  const altTeams = $("div[class*='teamsWrap'], [class*='team']");
  console.log(`   Альтернативных обёрток: ${altTeams.length}`);
}

console.log('\n4. Кнопки коэффициентов:');
const outcomeButtons = $("button[data-outcome-alias][data-odd]");
console.log(`   Найдено кнопок с коэффициентами: ${outcomeButtons.length}`);

if (outcomeButtons.length === 0) {
  const altButtons = $("button[data-outcome-alias], button[data-odd]");
  console.log(`   Альтернативных кнопок: ${altButtons.length}`);
}

console.log('\n5. Match ID и Line ID:');
const matchIdButtons = $("button[data-match-id][data-line-id]");
console.log(`   Найдено кнопок с ID: ${matchIdButtons.length}`);

console.log('\n6. Ссылки на детальные страницы:');
const detailLinks = $("a[class*='DefaultLine_lineLink']");
console.log(`   Найдено ссылок DefaultLine_lineLink: ${detailLinks.length}`);

const altLinks = $("a[href^='/line/']");
console.log(`   Найдено ссылок /line/: ${altLinks.length}`);

console.log('\n7. Лиги:');
const headerRows = $("tr[class*='LinesGroup_header']");
console.log(`   Найдено заголовков лиг: ${headerRows.length}`);

const titleH2 = $("h2[class*='LinesGroup_title']");
console.log(`   Найдено заголовков h2: ${titleH2.length}`);

console.log('\n=== Резюме ===');
console.log(`HTML длина: ${html.length} символов`);
console.log(`Таблиц LinesGroup_group: ${tables.length}`);
console.log(`Строк DefaultLine_line: ${matchRows.length}`);
console.log(`Обёрток команд: ${teamsWrap.length}`);
console.log(`Кнопок коэффициентов: ${outcomeButtons.length}`);
