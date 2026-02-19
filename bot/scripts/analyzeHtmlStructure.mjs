import fs from 'fs';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlFile = path.join(__dirname, '../../ParseInfoNew.html');
const html = fs.readFileSync(htmlFile, 'utf8');

console.log('=== Анализ структуры ParseInfoNew.html ===\n');
console.log(`Размер файла: ${html.length} символов\n`);

const $ = cheerio.load(html);

// 1. Ищем таблицы
console.log('1. ТАБЛИЦЫ:');
const tables = $('table');
console.log(`   Всего таблиц: ${tables.length}`);

if (tables.length > 0) {
  tables.slice(0, 10).each((i, table) => {
    const $table = $(table);
    const classes = $table.attr('class') || '';
    const rows = $table.find('tr').length;
    const hasLinesGroup = classes.includes('LinesGroup_group') || classes.includes('LinesGroup');
    const hasDefaultLine = $table.find('tr[class*="DefaultLine_line"]').length;
    console.log(`   Таблица ${i + 1}: классы="${classes.substring(0, 150)}", строк: ${rows}, LinesGroup: ${hasLinesGroup}, DefaultLine rows: ${hasDefaultLine}`);
  });
} else {
  console.log('   ⚠️ Таблиц не найдено!');
}

// 2. Ищем строки с data-match-id
console.log('\n2. СТРОКИ С data-match-id:');
const rowsWithMatchId = $('[data-match-id]');
console.log(`   Всего элементов с data-match-id: ${rowsWithMatchId.length}`);

// 3. Ищем кнопки с data-match-id
console.log('\n3. КНОПКИ С data-match-id:');
const buttonsWithMatchId = $('button[data-match-id]');
console.log(`   Всего кнопок с data-match-id: ${buttonsWithMatchId.length}`);

// 4. Ищем строки tr
console.log('\n4. ВСЕ СТРОКИ <tr>:');
const allRows = $('tr');
console.log(`   Всего строк <tr>: ${allRows.length}`);

// 5. Ищем строки с командами
console.log('\n5. СТРОКИ С КОМАНДАМИ:');
let rowsWithTeams = 0;
allRows.each((i, row) => {
  const $row = $(row);
  const hasTeams = $row.find("div[class*='team'], div[class*='Team'], [class*='teamsWrap']").length > 0;
  const hasMatchId = $row.find('[data-match-id]').length > 0;
  const hasOutcomes = $row.find('button[data-outcome-alias], button[data-odd]').length > 0;
  
  if (hasTeams || hasMatchId || hasOutcomes) {
    rowsWithTeams++;
    if (rowsWithTeams <= 5) {
      const classes = $row.attr('class') || '';
      const teams = $row.find("div[class*='team'], div[class*='Team']").map((_, el) => $(el).text().trim()).get().filter(Boolean);
      console.log(`   Строка ${rowsWithTeams}: классы="${classes.substring(0, 100)}", команды: ${teams.join(' vs ')}`);
    }
  }
});
console.log(`   Всего строк с командами/матчами: ${rowsWithTeams}`);

// 6. Ищем контейнеры с матчами
console.log('\n6. КОНТЕЙНЕРЫ:');
const divsWithGroup = $('div[class*="Group"], div[class*="group"]');
console.log(`   Div с Group: ${divsWithGroup.length}`);

const divsWithLine = $('div[class*="Line"], div[class*="line"]');
console.log(`   Div с Line: ${divsWithLine.length}`);

// 7. Проверяем структуру - ищем все элементы с классами, содержащими Line или Match
console.log('\n7. ЭЛЕМЕНТЫ С КЛЮЧЕВЫМИ КЛАССАМИ:');
const lineElements = $('[class*="Line"], [class*="line"]');
console.log(`   Элементов с Line в классе: ${lineElements.length}`);

const matchElements = $('[class*="Match"], [class*="match"]');
console.log(`   Элементов с Match в классе: ${matchElements.length}`);

// 8. Пробуем найти матчи по разным паттернам
console.log('\n8. ПОПЫТКА НАЙТИ МАТЧИ:');
let matchCount = 0;
const seenMatchIds = new Set();

// Ищем по data-match-id
$('[data-match-id]').each((i, el) => {
  const matchId = $(el).attr('data-match-id');
  if (matchId && !seenMatchIds.has(matchId)) {
    seenMatchIds.add(matchId);
    matchCount++;
  }
});

console.log(`   Уникальных match-id: ${matchCount}`);

// Пробуем найти все строки с DefaultLine_cell (ячейки матчей)
const cellsWithDefaultLine = $('td[class*="DefaultLine_cell"]');
console.log(`   Ячеек DefaultLine_cell: ${cellsWithDefaultLine.length}`);

// Группируем ячейки по родительским строкам
const rowsWithCells = new Set();
cellsWithDefaultLine.each((i, cell) => {
  const $row = $(cell).closest('tr');
  if ($row.length > 0) {
    rowsWithCells.add($row[0]);
  }
});
console.log(`   Строк с DefaultLine_cell: ${rowsWithCells.size}`);

// 9. Пробуем найти по структуре - строки с командами и коэффициентами
console.log('\n9. АНАЛИЗ ПО СТРУКТУРЕ:');
let potentialMatches = 0;
allRows.each((i, row) => {
  const $row = $(row);
  const cells = $row.find('td');
  if (cells.length > 3) {
    const hasOutcomes = $row.find('button[data-odd], button[data-outcome-alias]').length > 0;
    const hasTeams = $row.text().match(/[А-Яа-яA-Za-z]{3,}/g) && $row.text().match(/vs|против|—/i);
    if (hasOutcomes || hasTeams) {
      potentialMatches++;
    }
  }
});
console.log(`   Потенциальных матчей (по структуре): ${potentialMatches}`);

// 10. Выводим примеры структуры
console.log('\n10. ПРИМЕРЫ СТРУКТУРЫ:');
const firstTable = tables.first();
if (firstTable.length > 0) {
  const $firstTable = $(firstTable);
  const firstRows = $firstTable.find('tr').slice(0, 3);
  firstRows.each((i, row) => {
    const $row = $(row);
    const html = $row.html()?.substring(0, 300) || '';
    console.log(`   Строка ${i + 1}: ${html}...`);
  });
}

console.log('\n=== РЕЗЮМЕ ===');
console.log(`Таблиц: ${tables.length}`);
console.log(`Строк <tr>: ${allRows.length}`);
console.log(`Элементов с data-match-id: ${rowsWithMatchId.length}`);
console.log(`Кнопок с data-match-id: ${buttonsWithMatchId.length}`);
console.log(`Уникальных match-id: ${matchCount}`);
console.log(`Строк с командами: ${rowsWithTeams}`);
