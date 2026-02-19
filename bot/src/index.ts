import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { Telegraf, Markup } from "telegraf";
import type { Server } from "node:http";
import {
  parseW54SnapshotHtmlFromFile,
  parseW54SnapshotHtmlFromUrl
} from "./parsers/w54Snapshot";
import { parseW54DetailPageFromUrl } from "./parsers/w54DetailPage";

// Load env from common local files (Cursor blocks creating ".env*" via tools,
// so we support env.local/env.example too).
dotenv.config({ path: "env.local" });
dotenv.config({ path: "env.example" });
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

const PUBLIC_WEBAPP_URL = process.env.PUBLIC_WEBAPP_URL || "http://localhost:5173";
const PUBLIC_ADMIN_URL = process.env.PUBLIC_ADMIN_URL || "http://localhost:5174";

const PORT = Number(process.env.PORT || 3000);

// Minimal API for future expansion (auth, bets, wallet, payouts).
const app = express();
app.use(
  cors({
    origin: "*", // Allow all origins for dev (Live Server, file://, etc.)
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
app.get("/health", (_req, res) => res.json({ ok: true }));

// Parse snapshot dump (Parseinfo.html) into JSON.
app.get("/api/w54/snapshot", async (req, res) => {
  try {
    const file = (req.query.file as string) || "Parseinfo.html";
    const result = await parseW54SnapshotHtmlFromFile(file);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Parse live site https://w54rjjmb.com/sport?lc=1&ss=all
app.get("/api/w54/live", async (req, res) => {
  try {
    const url =
      (req.query.url as string) ||
      "https://w54rjjmb.com/sport?lc=1&ss=all";
    const result = await parseW54SnapshotHtmlFromUrl(url);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Get detailed match information from detail page
app.get("/api/w54/detail", async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).json({ ok: false, error: "Missing 'url' query parameter" });
      return;
    }
    console.log(`[API] /api/w54/detail called with url: ${url}`);
    const result = await parseW54DetailPageFromUrl(url);
    console.log(`[API] /api/w54/detail success, outcomes: ${result.outcomes.length}`);
    res.json(result);
  } catch (e: any) {
    console.error(`[API] /api/w54/detail error:`, e);
    console.error(`[API] Error stack:`, e?.stack);
    res.status(500).json({ 
      ok: false, 
      error: e?.message || String(e),
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    });
  }
});

function listenWithFallback(startPort: number, tries = 10) {
  const attempt = (port: number, remaining: number) => {
    const server: Server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[api] listening on http://localhost:${port}`);
    });

    server.once("error", (err: any) => {
      if (err?.code === "EADDRINUSE" && remaining > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[api] port ${port} is busy, trying ${port + 1}...`);
        try {
          server.close();
        } catch {
          // ignore
        }
        attempt(port + 1, remaining - 1);
        return;
      }

      // eslint-disable-next-line no-console
      console.error("[api] failed to start:", err);
      process.exit(1);
    });
  };

  attempt(startPort, tries);
}

listenWithFallback(PORT);

if (!BOT_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn("[bot] BOT_TOKEN is missing; bot won't start. API is still running.");
} else {
  // eslint-disable-next-line no-console
  console.log("[bot] starting…");
  // eslint-disable-next-line no-console
  console.log(`[bot] webapp url: ${PUBLIC_WEBAPP_URL}`);
  // eslint-disable-next-line no-console
  console.log(`[bot] admin url: ${PUBLIC_ADMIN_URL}`);

  const bot = new Telegraf(BOT_TOKEN);

  function isHttps(url: string) {
    return /^https:\/\//i.test(url);
  }

  function mainKeyboard() {
    // Always show buttons. If HTTPS is configured, they become WebApp buttons.
    if (isHttps(PUBLIC_WEBAPP_URL) && isHttps(PUBLIC_ADMIN_URL)) {
      return Markup.keyboard([
        [Markup.button.webApp("⚽ Ставки", PUBLIC_WEBAPP_URL)],
        [Markup.button.webApp("🛠️ Админка", PUBLIC_ADMIN_URL)]
      ])
        .resize()
        .persistent();
    }

    // Dev fallback: regular buttons (no WebApp) so Telegram won't reject the message.
    return Markup.keyboard([["⚽ Ставки"], ["🛠️ Админка"]]).resize().persistent();
  }

  async function explainHttps(ctx: any) {
    await ctx.reply(
      [
        "WebApp в Telegram открывается **только по HTTPS**.",
        "",
        "Сейчас у вас:",
        `- PUBLIC_WEBAPP_URL: ${PUBLIC_WEBAPP_URL}`,
        `- PUBLIC_ADMIN_URL: ${PUBLIC_ADMIN_URL}`,
        "",
        "Для разработки проще всего сделать HTTPS туннель, например через Cloudflare Tunnel:",
        "1) Установите `cloudflared`",
        "2) Запустите: `cloudflared tunnel --url http://localhost:5173`",
        "3) Получившийся `https://...` вставьте в PUBLIC_WEBAPP_URL",
        "4) Аналогично для админки: `cloudflared tunnel --url http://localhost:5174` → PUBLIC_ADMIN_URL",
        "",
        "После этого кнопки откроют WebApp прямо внутри Telegram."
      ].join("\n")
    );
  }

  bot.start(async (ctx) => {
    await ctx.reply("Выберите раздел:", mainKeyboard());
    if (!isHttps(PUBLIC_WEBAPP_URL) || !isHttps(PUBLIC_ADMIN_URL)) {
      await explainHttps(ctx);
    }
  });

  bot.command("app", async (ctx) => {
    await ctx.reply("Ставки:", mainKeyboard());
    if (!isHttps(PUBLIC_WEBAPP_URL)) await explainHttps(ctx);
  });
  bot.command("admin", async (ctx) => {
    await ctx.reply("Админка:", mainKeyboard());
    if (!isHttps(PUBLIC_ADMIN_URL)) await explainHttps(ctx);
  });

  bot.hears("⚽ Ставки", async (ctx) => {
    if (!isHttps(PUBLIC_WEBAPP_URL)) {
      await explainHttps(ctx);
      return;
    }
    await ctx.reply("Открывайте ставки кнопкой WebApp ниже:", mainKeyboard());
  });
  bot.hears("🛠️ Админка", async (ctx) => {
    if (!isHttps(PUBLIC_ADMIN_URL)) {
      await explainHttps(ctx);
      return;
    }
    await ctx.reply("Открывайте админку кнопкой WebApp ниже:", mainKeyboard());
  });

  bot.catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[bot] unhandled:", err);
  });

  bot.launch()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("[bot] launched");
    })
    .catch((err) => {
      // Most common in dev: another instance is already polling (409).
      // eslint-disable-next-line no-console
      console.error("[bot] failed to launch:", err?.response?.description || err);
      // Keep process alive for API + frontends.
    });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

