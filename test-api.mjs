// Скрипт для проверки API endpoint
// Запуск: node test-api.mjs

const API_URL = 'http://localhost:3000/api/w54/snapshot?file=ParseInfoNew.html';

console.log('=== Тестирование API ===');
console.log(`URL: ${API_URL}`);
console.log(`Время запроса: ${new Date().toISOString()}\n`);

try {
  const response = await fetch(API_URL, {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  console.log('=== Результат ===');
  console.log(`Source: ${data.source}`);
  console.log(`Matches count: ${data.matches?.length || 0}`);
  console.log(`Meta:`, JSON.stringify(data.meta, null, 2));
  
  console.log('\n=== Первые 5 матчей ===');
  if (data.matches && data.matches.length > 0) {
    data.matches.slice(0, 5).forEach((match, idx) => {
      console.log(`\n${idx + 1}. ${match.home} vs ${match.away}`);
      console.log(`   Match ID: ${match.matchId || 'N/A'}`);
      console.log(`   Line ID: ${match.lineId || 'N/A'}`);
      console.log(`   League: ${match.league || 'N/A'}`);
      console.log(`   Is Live: ${match.isLive ? 'Yes' : 'No'}`);
      if (match.isLive) {
        console.log(`   Live Time: ${match.liveTime || 'N/A'}`);
        console.log(`   Score: ${match.score ? `${match.score.home}-${match.score.away}` : 'N/A'}`);
      }
      console.log(`   Outcomes: ${match.outcomes?.length || 0}`);
      if (match.outcomes && match.outcomes.length > 0) {
        const outcomes1x2 = match.outcomes.filter(o => o.type === '1x2');
        if (outcomes1x2.length > 0) {
          console.log(`   1X2: ${outcomes1x2.map(o => `${o.label}=${o.odd}`).join(', ')}`);
        }
      }
    });
  } else {
    console.log('Матчи не найдены!');
  }

  console.log('\n=== Статистика ===');
  if (data.matches && data.matches.length > 0) {
    const liveMatches = data.matches.filter(m => m.isLive).length;
    const withOutcomes = data.matches.filter(m => m.outcomes && m.outcomes.length > 0).length;
    const withDetailUrl = data.matches.filter(m => m.detailUrl).length;
    
    console.log(`Всего матчей: ${data.matches.length}`);
    console.log(`LIVE матчей: ${liveMatches}`);
    console.log(`С коэффициентами: ${withOutcomes}`);
    console.log(`С детальной страницей: ${withDetailUrl}`);
    
    // Группировка по лигам
    const leagues = {};
    data.matches.forEach(m => {
      const league = m.league || 'Unknown';
      leagues[league] = (leagues[league] || 0) + 1;
    });
    
    console.log('\n=== Лиги ===');
    Object.entries(leagues)
      .sort((a, b) => b[1] - a[1])
      .forEach(([league, count]) => {
        console.log(`  ${league}: ${count} матчей`);
      });
  }

  console.log('\n=== Полный JSON (первые 2000 символов) ===');
  const jsonStr = JSON.stringify(data, null, 2);
  console.log(jsonStr.substring(0, 2000));
  if (jsonStr.length > 2000) {
    console.log(`\n... (еще ${jsonStr.length - 2000} символов)`);
  }

} catch (error) {
  console.error('=== Ошибка ===');
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
