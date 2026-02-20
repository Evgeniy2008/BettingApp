import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Telegraf, Markup } from "telegraf";
import { parseW54SnapshotHtmlFromFile, parseW54SnapshotHtmlFromUrl } from "./parsers/w54Snapshot";
import { parseW54DetailPageFromUrl } from "./parsers/w54DetailPage";
import * as db from "./db";
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
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, etc.)
        if (!origin)
            return callback(null, true);
        // Allow localhost and 127.0.0.1 on any port
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow file:// protocol (for local development)
        if (origin === "null" || origin === "file://") {
            return callback(null, true);
        }
        // For production, you can add specific domains here
        callback(null, true);
    },
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
// Middleware to get or create user session
async function getUserSession(req, res, next) {
    const sessionToken = req.cookies.session_token;
    if (sessionToken) {
        const user = db.getUserBySessionToken(sessionToken);
        if (user) {
            req.user = user;
            return next();
        }
    }
    // Create new user session if no valid token
    const newUser = db.createUser();
    res.cookie("session_token", newUser.session_token, {
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        sameSite: "lax"
    });
    req.user = newUser;
    next();
}
// Middleware to check admin auth
function requireAdmin(req, res, next) {
    const adminToken = req.cookies.admin_token;
    if (!adminToken || !db.verifyAdminSession(adminToken)) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
    }
    next();
}
app.get("/health", (_req, res) => res.json({ ok: true }));
// Parse snapshot dump (Parseinfo.html) into JSON.
app.get("/api/w54/snapshot", async (req, res) => {
    try {
        const file = req.query.file || "Parseinfo.html";
        const result = await parseW54SnapshotHtmlFromFile(file);
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
// Parse live site https://w54rjjmb.com/sport?lc=1&ss=all
app.get("/api/w54/live", async (req, res) => {
    try {
        const url = req.query.url ||
            "https://w54rjjmb.com/sport?lc=1&ss=all";
        const result = await parseW54SnapshotHtmlFromUrl(url);
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
// Get detailed match information from detail page
app.get("/api/w54/detail", async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            res.status(400).json({ ok: false, error: "Missing 'url' query parameter" });
            return;
        }
        console.log(`[API] /api/w54/detail called with url: ${url}`);
        const result = await parseW54DetailPageFromUrl(url);
        console.log(`[API] /api/w54/detail success, outcomes: ${result.outcomes.length}`);
        res.json(result);
    }
    catch (e) {
        console.error(`[API] /api/w54/detail error:`, e);
        console.error(`[API] Error stack:`, e?.stack);
        res.status(500).json({
            ok: false,
            error: e?.message || String(e),
            stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
        });
    }
});
// ========== User API ==========
app.get("/api/user/me", getUserSession, (req, res) => {
    const user = req.user;
    res.json({
        ok: true,
        user: {
            id: user.id,
            balance: user.balance,
            credit_limit: user.credit_limit,
            telegram_username: user.telegram_username
        }
    });
});
// ========== Deposit API ==========
app.get("/api/deposits/wallet", (req, res) => {
    const wallet = db.getDepositWallet();
    res.json({ ok: true, wallet });
});
app.post("/api/deposits", getUserSession, (req, res) => {
    try {
        const user = req.user;
        const { amount, currency, tx_hash } = req.body;
        if (!amount || !currency || !tx_hash) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }
        if (amount <= 0) {
            res.status(400).json({ ok: false, error: "Amount must be positive" });
            return;
        }
        const deposit = db.createDeposit(user.id, amount, currency, tx_hash);
        res.json({ ok: true, deposit });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.get("/api/deposits", getUserSession, (req, res) => {
    const user = req.user;
    const deposits = db.getDepositsByUserId(user.id);
    res.json({ ok: true, deposits });
});
// ========== Withdrawal API ==========
app.post("/api/withdrawals", getUserSession, (req, res) => {
    try {
        const user = req.user;
        const { amount, currency, address } = req.body;
        if (!amount || !currency || !address) {
            res.status(400).json({ ok: false, error: "Missing required fields" });
            return;
        }
        if (amount <= 0) {
            res.status(400).json({ ok: false, error: "Amount must be positive" });
            return;
        }
        if (user.balance < amount) {
            res.status(400).json({ ok: false, error: "Insufficient balance" });
            return;
        }
        // Reserve balance (subtract immediately)
        db.updateUserBalance(user.id, -amount);
        const withdrawal = db.createWithdrawal(user.id, amount, currency, address);
        res.json({ ok: true, withdrawal });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.get("/api/withdrawals", getUserSession, (req, res) => {
    const user = req.user;
    const withdrawals = db.getWithdrawalsByUserId(user.id);
    res.json({ ok: true, withdrawals });
});
// ========== Admin API ==========
app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (!password) {
        res.status(400).json({ ok: false, error: "Password required" });
        return;
    }
    if (!db.verifyAdminPassword(password)) {
        res.status(401).json({ ok: false, error: "Invalid password" });
        return;
    }
    const token = db.createAdminSession();
    res.cookie("admin_token", token, {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        sameSite: "lax"
    });
    res.json({ ok: true });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => {
    res.clearCookie("admin_token");
    res.json({ ok: true });
});
app.get("/api/admin/me", requireAdmin, (req, res) => {
    res.json({ ok: true, authenticated: true });
});
app.get("/api/admin/users", requireAdmin, (req, res) => {
    const users = db.getAllUsers();
    res.json({ ok: true, users });
});
app.put("/api/admin/users/:id/limit", requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const { credit_limit } = req.body;
        if (credit_limit === undefined || credit_limit < 0) {
            res.status(400).json({ ok: false, error: "Invalid credit limit" });
            return;
        }
        const user = db.getUserById(id);
        if (!user) {
            res.status(404).json({ ok: false, error: "User not found" });
            return;
        }
        const stmt = db.default.prepare("UPDATE users SET credit_limit = ? WHERE id = ?");
        stmt.run(credit_limit, id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.get("/api/admin/deposits", requireAdmin, (req, res) => {
    const status = req.query.status;
    const deposits = db.getAllDeposits(status);
    res.json({ ok: true, deposits });
});
app.post("/api/admin/deposits/:id/approve", requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        db.approveDeposit(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.post("/api/admin/deposits/:id/reject", requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        db.rejectDeposit(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.get("/api/admin/withdrawals", requireAdmin, (req, res) => {
    const status = req.query.status;
    const withdrawals = db.getAllWithdrawals(status);
    res.json({ ok: true, withdrawals });
});
app.post("/api/admin/withdrawals/:id/approve", requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        db.approveWithdrawal(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.post("/api/admin/withdrawals/:id/reject", requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        db.rejectWithdrawal(id);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.get("/api/admin/settings/wallet", requireAdmin, (req, res) => {
    const wallet = db.getDepositWallet();
    res.json({ ok: true, wallet });
});
app.put("/api/admin/settings/wallet", requireAdmin, (req, res) => {
    try {
        const { wallet } = req.body;
        if (!wallet) {
            res.status(400).json({ ok: false, error: "Wallet address required" });
            return;
        }
        db.setDepositWallet(wallet);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
app.put("/api/admin/settings/password", requireAdmin, (req, res) => {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.length < 8) {
            res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
            return;
        }
        db.updateAdminPassword(new_password);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
function listenWithFallback(startPort, tries = 10) {
    const attempt = (port, remaining) => {
        const server = app.listen(port, () => {
            // eslint-disable-next-line no-console
            console.log(`[api] listening on http://localhost:${port}`);
        });
        server.once("error", (err) => {
            if (err?.code === "EADDRINUSE" && remaining > 0) {
                // eslint-disable-next-line no-console
                console.warn(`[api] port ${port} is busy, trying ${port + 1}...`);
                try {
                    server.close();
                }
                catch {
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
}
else {
    // eslint-disable-next-line no-console
    console.log("[bot] starting…");
    // eslint-disable-next-line no-console
    console.log(`[bot] webapp url: ${PUBLIC_WEBAPP_URL}`);
    // eslint-disable-next-line no-console
    console.log(`[bot] admin url: ${PUBLIC_ADMIN_URL}`);
    const bot = new Telegraf(BOT_TOKEN);
    function isHttps(url) {
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
    async function explainHttps(ctx) {
        await ctx.reply([
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
        ].join("\n"));
    }
    bot.start(async (ctx) => {
        await ctx.reply("Выберите раздел:", mainKeyboard());
        if (!isHttps(PUBLIC_WEBAPP_URL) || !isHttps(PUBLIC_ADMIN_URL)) {
            await explainHttps(ctx);
        }
    });
    bot.command("app", async (ctx) => {
        await ctx.reply("Ставки:", mainKeyboard());
        if (!isHttps(PUBLIC_WEBAPP_URL))
            await explainHttps(ctx);
    });
    bot.command("admin", async (ctx) => {
        await ctx.reply("Админка:", mainKeyboard());
        if (!isHttps(PUBLIC_ADMIN_URL))
            await explainHttps(ctx);
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
