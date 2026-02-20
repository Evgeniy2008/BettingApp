import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

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
                const btn1 = document.querySelector('.auto_login') as HTMLElement;
                if (btn1) {
                    btn1.click();
                    return true;
                }
                // Пробуем кнопку с текстом "Вход"
                const buttons = Array.from(document.querySelectorAll('button'));
                const loginBtn = buttons.find(btn => btn.textContent?.includes('Вход'));
                if (loginBtn) {
                    (loginBtn as HTMLElement).click();
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
        
        // Сохраняем в корень проекта
        // Определяем корень проекта: если мы в bot/, то на уровень выше, иначе в текущую директорию
        const projectRoot = process.cwd().endsWith('bot') 
            ? path.resolve(process.cwd(), '..')
            : process.cwd();
        const outputPath = path.resolve(projectRoot, 'testing.html');
        
        console.log('Сохранение в testing.html...');
        fs.writeFileSync(outputPath, htmlContent, 'utf8');
        
        console.log('Готово! Контент сохранен в testing.html');
        console.log(`Размер файла: ${(htmlContent.length / 1024).toFixed(2)} KB`);
        console.log(`Путь: ${outputPath}`);
        
    } catch (error) {
        console.error('Ошибка при парсинге:', error);
        throw error;
    } finally {
        await browser.close();
        console.log('Браузер закрыт');
    }
}

parsePage().catch(console.error);
