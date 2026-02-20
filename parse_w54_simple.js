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
            
            // Ждем немного, чтобы модалка полностью загрузилась
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Очищаем и фокусируем поля перед заполнением
            await page.evaluate(() => {
                const loginField = document.getElementById('uReal');
                const passwordField = document.getElementById('pReal');
                if (loginField) {
                    loginField.value = '';
                    loginField.focus();
                }
                if (passwordField) {
                    passwordField.value = '';
                }
            });
            
            // Заполняем поле логина
            console.log('Заполнение поля логина...');
            await page.focus('#uReal');
            await page.type('#uReal', '380638022106', { delay: 50 });
            
            // Триггерим события input для поля логина
            await page.evaluate(() => {
                const loginField = document.getElementById('uReal');
                if (loginField) {
                    loginField.dispatchEvent(new Event('input', { bubbles: true }));
                    loginField.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            
            // Заполняем поле пароля
            console.log('Заполнение поля пароля...');
            await page.focus('#pReal');
            await page.type('#pReal', 'xr10xr10', { delay: 50 });
            
            // Триггерим события input для поля пароля
            await page.evaluate(() => {
                const passwordField = document.getElementById('pReal');
                if (passwordField) {
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            
            console.log('Поля логина и пароля заполнены');
            
            // Ждем немного перед нажатием кнопки
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Нажимаем кнопку "Войти"
            console.log('Нажатие кнопки "Войти"...');
            try {
                // Пробуем несколько селекторов для кнопки "Войти"
                await page.waitForSelector('button.LoginForm_submitButton__FvjWH, button[type="submit"]', { timeout: 5000 });
                
                // Ждем навигации после отправки формы
                const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {
                    // Если навигации не произошло, это нормально - может быть AJAX запрос
                    console.log('Навигация не произошла, возможно AJAX запрос');
                });
                
                const submitClicked = await page.evaluate(() => {
                    // Пробуем найти кнопку по классу
                    const submitBtn = document.querySelector('button.LoginForm_submitButton__FvjWH');
                    if (submitBtn && !submitBtn.disabled) {
                        submitBtn.click();
                        return true;
                    }
                    // Пробуем найти кнопку submit
                    const submitBtn2 = document.querySelector('button[type="submit"]');
                    if (submitBtn2 && !submitBtn2.disabled) {
                        submitBtn2.click();
                        return true;
                    }
                    // Пробуем найти кнопку с текстом "Войти"
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const enterBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('Войти') && !btn.disabled);
                    if (enterBtn) {
                        enterBtn.click();
                        return true;
                    }
                    return false;
                });
                
                if (!submitClicked) {
                    // Fallback: прямой клик
                    await page.click('button.LoginForm_submitButton__FvjWH');
                }
                
                console.log('Кнопка "Войти" нажата, ждем обработки...');
                
                // Ждем навигации или изменения страницы
                await navigationPromise;
                
            } catch (error) {
                console.warn('Не удалось нажать кнопку "Войти":', error);
            }
            
        } catch (error) {
            console.warn('Не удалось найти или нажать кнопку "Вход" или модалка не появилась:', error);
            console.log('Продолжаем без нажатия кнопки...');
        }
        
        // Ждем, чтобы страница полностью обновилась после входа
        console.log('Ожидание 5 секунд для полной загрузки страницы после входа...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Проверяем, что мы вошли (ищем элементы, которые появляются после входа)
        try {
            // Ждем исчезновения модалки или появления элементов авторизованного пользователя
            await page.waitForFunction(() => {
                // Проверяем, что модалка закрылась или появились элементы авторизованного пользователя
                const modal = document.querySelector('.ReactModal__Content--after-open');
                const userBalance = document.querySelector('.auto_user_balance');
                return !modal || userBalance !== null;
            }, { timeout: 10000 }).catch(() => {
                console.log('Модалка может быть еще открыта, продолжаем...');
            });
        } catch (error) {
            console.log('Проверка входа завершена');
        }
        
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
