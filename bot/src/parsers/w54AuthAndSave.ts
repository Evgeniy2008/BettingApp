import puppeteer from "puppeteer";
import os from "node:os";
import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";

/**
 * Авторизуется на сайте w54rjjmb.com и сохраняет HTML страницы в output.html.
 * Выполняет следующие действия:
 * 1. Открывает страницу https://w54rjjmb.com/
 * 2. Ждет 3 секунды пока загрузится
 * 3. Нажимает кнопку входа
 * 4. Вводит логин и пароль
 * 5. Нажимает кнопку "Войти"
 * 6. Ждет 3 секунды
 * 7. Сохраняет весь HTML в файл output.html
 */
export async function loginAndSaveHtml(): Promise<{ success: boolean; error?: string }> {
  const url = "https://w54rjjmb.com/";
  const login = "380638022106";
  const password = "xr10xr10";
  
  console.log(`[AuthSave] Starting login and save HTML process on ${url}`);
  
  let browser;
  let uniqueUserDataDir: string | undefined;
  
  try {
    // Launch browser with unique temp directory
    const tempDir = os.tmpdir();
    uniqueUserDataDir = path.join(tempDir, `puppeteer-auth-save-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: uniqueUserDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-cache',
        '--disable-application-cache',
      ]
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await page.setCacheEnabled(false);
    
    // Navigate to the page
    console.log(`[AuthSave] Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait 3 seconds for page to load
    console.log(`[AuthSave] Waiting 3 seconds for page to load...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Wait for login button to appear and click it
    console.log(`[AuthSave] Waiting for login button...`);
    try {
      // Try multiple selectors for login button
      await page.waitForSelector('.auto_login, button.auto_login, .Header_auth__wNTIs button', { timeout: 10000 });
      console.log(`[AuthSave] Clicking login button...`);
      
      // Try clicking with different selectors
      const clicked = await page.evaluate(() => {
        // Try .auto_login first
        const btn1 = document.querySelector('.auto_login') as HTMLElement;
        if (btn1) {
          btn1.click();
          return true;
        }
        // Try button with text "Вход"
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginBtn = buttons.find(btn => btn.textContent?.includes('Вход'));
        if (loginBtn) {
          (loginBtn as HTMLElement).click();
          return true;
        }
        return false;
      });
      
      if (!clicked) {
        // Fallback: try direct click
        await page.click('.auto_login');
      }
    } catch (err) {
      console.error(`[AuthSave] Failed to find or click login button:`, err);
      throw new Error('Login button not found');
    }
    
    // Wait for login modal to appear
    console.log(`[AuthSave] Waiting for login modal...`);
    try {
      await page.waitForSelector('#uReal', { timeout: 10000 });
      console.log(`[AuthSave] Login modal appeared`);
    } catch (err) {
      console.error(`[AuthSave] Login modal did not appear:`, err);
      throw new Error('Login modal not found');
    }
    
    // Clear fields first (in case they have default values)
    await page.evaluate(() => {
      const loginField = document.getElementById('uReal') as HTMLInputElement;
      const passwordField = document.getElementById('pReal') as HTMLInputElement;
      if (loginField) loginField.value = '';
      if (passwordField) passwordField.value = '';
    });
    
    // Fill in login field
    console.log(`[AuthSave] Filling in login field...`);
    await page.type('#uReal', login, { delay: 50 });
    
    // Fill in password field
    console.log(`[AuthSave] Filling in password field...`);
    await page.type('#pReal', password, { delay: 50 });
    
    // Click submit button
    console.log(`[AuthSave] Clicking submit button...`);
    try {
      // Try multiple selectors for submit button
      await page.click('button.LoginForm_submitButton__FvjWH, button[type="submit"].LoginForm_submitButton__FvjWH');
    } catch (err) {
      // Try alternative selector
      const clicked = await page.evaluate(() => {
        const submitBtn = document.querySelector('button[type="submit"]') as HTMLElement;
        if (submitBtn) {
          submitBtn.click();
          return true;
        }
        // Try button with text "Войти"
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginSubmitBtn = buttons.find(btn => btn.textContent?.includes('Войти'));
        if (loginSubmitBtn) {
          (loginSubmitBtn as HTMLElement).click();
          return true;
        }
        return false;
      });
      
      if (!clicked) {
        throw new Error('Submit button not found');
      }
    }
    
    // Wait 3 seconds after clicking submit
    console.log(`[AuthSave] Waiting 3 seconds after login...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get full HTML content
    console.log(`[AuthSave] Getting page HTML content...`);
    const htmlContent = await page.content();
    
    // Save to output.html
    const outputPath = path.join(process.cwd(), 'output.html');
    console.log(`[AuthSave] Saving HTML to ${outputPath}...`);
    await fs.writeFile(outputPath, htmlContent, 'utf-8');
    console.log(`[AuthSave] HTML saved successfully to ${outputPath}`);
    
    return {
      success: true
    };
    
  } catch (error: any) {
    console.error(`[AuthSave] Error during login and save process:`, error);
    return {
      success: false,
      error: error.message || String(error)
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    // Clean up temp directory
    if (uniqueUserDataDir && fsSync.existsSync(uniqueUserDataDir)) {
      try {
        fsSync.rmSync(uniqueUserDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn(`[AuthSave] Failed to cleanup temp directory:`, cleanupErr);
      }
    }
  }
}
