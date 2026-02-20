const fs = require('fs');
const path = require('path');

// Пытаемся найти puppeteer в разных местах
let puppeteer;
try {
    // Сначала пробуем из bot/node_modules
    puppeteer = require(path.join(__dirname, 'bot', 'node_modules', 'puppeteer'));
} catch (e) {
    try {
        // Потом пробуем глобально
        puppeteer = require('puppeteer');
    } catch (e2) {
        console.error('Не удалось найти puppeteer. Установите его: cd bot && npm install');
        process.exit(1);
    }
}

async function parsePage() {
    console.log('Запуск браузера...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        console.log('Открытие страницы https://w54rjjmb.com/...');
        await page.goto('https://w54rjjmb.com/', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        console.log('Ожидание появления кнопки "Вход"...');
        try {
            // Ждем появления кнопки входа (пробуем разные селекторы)
            await page.waitForSelector('.auto_login, button.auto_login, .Header_auth__wNTIs button', { timeout: 10000 });
            console.log('Кнопка "Вход" найдена, нажимаем...');
            
            // Пробуем нажать кнопку разными способами
            const clicked = await page.evaluate(() => {
                // Пробуем .auto_login сначала
                const btn1 = document.querySelector('.auto_login');
                if (btn1) {
                    btn1.click();
                    return true;
                }
                // Пробуем кнопку с текстом "Вход"
                const buttons = Array.from(document.querySelectorAll('button'));
                const loginBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Вход'));
                if (loginBtn) {
                    loginBtn.click();
                    return true;
                }
                return false;
            });
            
            if (!clicked) {
                // Fallback: прямой клик
                await page.click('.auto_login');
            }
            
            console.log('Кнопка "Вход" нажата');
            
            // Ждем появления модалки входа (поле логина #uReal)
            console.log('Ожидание появления модалки входа...');
            await page.waitForSelector('#uReal', { timeout: 10000 });
            console.log('Модалка входа появилась');
            
        } catch (error) {
            console.warn('Не удалось найти или нажать кнопку "Вход" или модалка не появилась:', error);
            console.log('Продолжаем без нажатия кнопки...');
        }
        
        console.log('Ожидание 2 секунды после появления модалки...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('Получение HTML контента...');
        const htmlContent = await page.content();
        
        console.log('Сохранение в testing.html...');
        fs.writeFileSync('testing.html', htmlContent, 'utf8');
        
        console.log('Готово! Контент сохранен в testing.html');
        console.log(`Размер файла: ${(htmlContent.length / 1024).toFixed(2)} KB`);
        
    } catch (error) {
        console.error('Ошибка при парсинге:', error);
        throw error;
    } finally {
        await browser.close();
        console.log('Браузер закрыт');
    }
}

parsePage().catch(console.error);
