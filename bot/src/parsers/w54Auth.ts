import puppeteer from "puppeteer";
import os from "node:os";
import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";

/**
 * Авторизуется на сайте w54rjjmb.com и получает баланс пользователя.
 * Выполняет следующие действия:
 * 1. Открывает страницу https://w54rjjmb.com/
 * 2. Нажимает кнопку входа
 * 3. Вводит логин и пароль в модальном окне
 * 4. Нажимает кнопку "Войти"
 * 5. Ждет загрузки страницы
 * 6. Извлекает баланс из элемента .auto_user_balance
 */
export async function loginAndGetBalance(): Promise<{ success: boolean; balance?: string; error?: string }> {
  const url = "https://w54rjjmb.com/";
  const login = "380638022106";
  const password = "xr10xr10";
  
  console.log(`[Auth] Starting login process on ${url}`);
  
  let browser;
  let uniqueUserDataDir: string | undefined;
  
  try {
    // Launch browser with unique temp directory
    const tempDir = os.tmpdir();
    uniqueUserDataDir = path.join(tempDir, `puppeteer-auth-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    
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
    console.log(`[Auth] Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for login button to appear and click it
    console.log(`[Auth] Waiting for login button...`);
    try {
      // Try multiple selectors for login button
      await page.waitForSelector('.auto_login, button.auto_login, .Header_auth__wNTIs button', { timeout: 10000 });
      console.log(`[Auth] Clicking login button...`);
      
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
        const loginBtn = buttons.find(btn => btn.textContent?.includes('Вход') || btn.textContent?.includes('Вход'));
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
      console.error(`[Auth] Failed to find or click login button:`, err);
      throw new Error('Login button not found');
    }
    
    // Wait for login modal to appear
    console.log(`[Auth] Waiting for login modal...`);
    try {
      await page.waitForSelector('#uReal', { timeout: 10000 });
      console.log(`[Auth] Login modal appeared`);
    } catch (err) {
      console.error(`[Auth] Login modal did not appear:`, err);
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
    console.log(`[Auth] Filling in login field...`);
    await page.type('#uReal', login, { delay: 50 });
    
    // Fill in password field
    console.log(`[Auth] Filling in password field...`);
    await page.type('#pReal', password, { delay: 50 });
    
    // Click submit button
    console.log(`[Auth] Clicking submit button...`);
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
    
    // Wait for page to load after login - wait 5 seconds for page to fully render
    console.log(`[Auth] Waiting 5 seconds for page to load after login...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Save full HTML to file for debugging
    console.log(`[Auth] Saving page HTML to testhtml file...`);
    const htmlContent = await page.content();
    const testHtmlPath = path.join(process.cwd(), 'testhtml');
    await fs.writeFile(testHtmlPath, htmlContent, 'utf-8');
    console.log(`[Auth] HTML saved to ${testHtmlPath}`);
    
    // Extract balance
    console.log(`[Auth] Extracting balance...`);
    const balance = await page.evaluate(() => {
      // Try multiple selectors for balance element
      let balanceEl = document.querySelector('.auto_user_balance');
      
      if (!balanceEl) {
        // Try alternative selectors
        balanceEl = document.querySelector('span.auto_user_balance');
      }
      
      if (!balanceEl) {
        // Try to find any element with class containing "balance"
        const allElements = document.querySelectorAll('[class*="balance"], [class*="Balance"], [class*="user"], [class*="User"]');
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text && (text.match(/[\d,.\s]+[₴$€]/) || text.match(/[\d,.\s]+/))) {
            balanceEl = el;
            break;
          }
        }
      }
      
      if (!balanceEl) {
        // Try to find element by text pattern (contains currency symbol) - search in all elements
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          // Look for pattern like "549,50 ₴" or similar
          if (text.match(/^[\d,.\s]+[₴$€]$/) || text.match(/^[\d,.\s]+[₴$€]\s*$/)) {
            balanceEl = el;
            break;
          }
        }
      }
      
      if (!balanceEl) {
        // Try to find in header area (user info section)
        const header = document.querySelector('header, .Header_header, [class*="Header"]');
        if (header) {
          const headerElements = header.querySelectorAll('span, div, button');
          for (const el of headerElements) {
            const text = el.textContent?.trim() || '';
            if (text.match(/[\d,.\s]+[₴$€]/)) {
              balanceEl = el;
              break;
            }
          }
        }
      }
      
      return balanceEl ? balanceEl.textContent?.trim() || null : null;
    });
    
    if (!balance) {
      // Debug: get more detailed page info
      const pageContent = await page.evaluate(() => {
        // Find all elements with numbers and currency symbols
        const allElements = Array.from(document.querySelectorAll('*'));
        const candidates = [];
        
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text.match(/[\d,.\s]+[₴$€]/) || (text.match(/^[\d,.\s]+$/) && text.length < 20)) {
            candidates.push({
              tag: el.tagName,
              class: el.className,
              id: el.id,
              text: text.substring(0, 100)
            });
          }
        }
        
        return {
          candidates: candidates.slice(0, 30),
          headerHtml: document.querySelector('header, .Header_header')?.outerHTML?.substring(0, 2000) || 'No header found',
          allSpans: Array.from(document.querySelectorAll('span')).slice(0, 50).map(s => ({
            class: s.className,
            text: s.textContent?.trim().substring(0, 50)
          }))
        };
      });
      console.error(`[Auth] Balance element not found. Debug info:`, JSON.stringify(pageContent, null, 2));
      throw new Error('Balance not found in element');
    }
    
    console.log(`[Auth] Balance extracted: ${balance}`);
    
    return {
      success: true,
      balance: balance
    };
    
  } catch (error: any) {
    console.error(`[Auth] Error during login process:`, error);
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
        console.warn(`[Auth] Failed to cleanup temp directory:`, cleanupErr);
      }
    }
  }
}
