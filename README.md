# BetsBot (Telegram WebApp + Admin)

Проект: Telegram-бот + два WebApp интерфейса:

- `web/`: интерфейс ставок (лиги/матчи/купон) + кошелёк (депозит криптой/лимиты/выплаты) — **чистые HTML/CSS/JS, без React/TS/Tailwind**
- `admin/`: админка (пользователи/лимиты/заявки выплат) — **чистые HTML/CSS/JS**
- `bot/`: Telegraf-бот, который показывает кнопки открытия WebApp и админки

## Запуск (dev)

Фронты можно запускать как угодно, это обычные статики:

- через любой статический сервер (`npm run dev`), или
- просто через Live Server в VS Code (открыть `web/index.html` или `admin/index.html`).

## Telegram

В BotFather:

- выставьте домены WebApp на те, где будет хоститься фронт
- запустите бота и нажмите кнопки **“Ставки”** или **“Админка”**

> Важно: Telegram WebApp-кнопки принимают **только HTTPS** ссылки. `http://localhost` не откроется внутри Telegram.
>
> Для dev используйте HTTPS туннель (пример Cloudflare Tunnel):
> - `cloudflared tunnel --url http://localhost:5173` → вставьте выданный `https://...` в `PUBLIC_WEBAPP_URL`
> - `cloudflared tunnel --url http://localhost:5174` → вставьте выданный `https://...` в `PUBLIC_ADMIN_URL`

> Важно: реальная интеграция Telegram WebApp `initData`/проверка подписи и реальный backend (ставки, кошелёк, выплаты) будут добавляться следующим этапом.

