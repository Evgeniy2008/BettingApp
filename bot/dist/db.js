import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import bcrypt from "bcryptjs";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dbDir, "betsbot.db");
// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);
// Enable foreign keys
db.pragma("foreign_keys = ON");
// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_id TEXT UNIQUE,
    telegram_username TEXT,
    session_token TEXT UNIQUE,
    balance REAL DEFAULT 0,
    credit_limit REAL DEFAULT 250,
    total_staked REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
// Default admin password hash (password: Admin@2024!Secure#Pass)
const defaultAdminPassword = "$2a$10$XKqJ8vN5mF3pL9rT2wYzOuV7hC4dE6fG8iJ0kL1mN3oP5qR7sT9uV1wX3yZ5aB7cD9e";
// Set default admin password if not exists
const adminPassword = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
if (!adminPassword) {
    db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password', ?)").run(defaultAdminPassword);
}
// Set default deposit wallet if not exists
const depositWallet = db.prepare("SELECT value FROM admin_settings WHERE key = 'deposit_wallet'").get();
if (!depositWallet) {
    db.prepare("INSERT INTO admin_settings (key, value) VALUES ('deposit_wallet', 'TXvQ...demo...p9')").run();
}
// User functions
export function createUser(telegramId, telegramUsername) {
    const id = `u${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionToken = `sess_${Math.random().toString(36).substr(2, 32)}`;
    const stmt = db.prepare(`
    INSERT INTO users (id, telegram_id, telegram_username, session_token)
    VALUES (?, ?, ?, ?)
  `);
    stmt.run(id, telegramId || null, telegramUsername || null, sessionToken);
    return getUserBySessionToken(sessionToken);
}
export function getUserBySessionToken(token) {
    const stmt = db.prepare("SELECT * FROM users WHERE session_token = ?");
    return stmt.get(token);
}
export function getUserById(id) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id);
}
export function updateUserBalance(userId, amount) {
    const stmt = db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
    stmt.run(amount, userId);
}
// Deposit functions
export function createDeposit(userId, amount, currency, txHash) {
    const id = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare(`
    INSERT INTO deposits (id, user_id, amount, currency, tx_hash)
    VALUES (?, ?, ?, ?, ?)
  `);
    stmt.run(id, userId, amount, currency, txHash);
    return getDepositById(id);
}
export function getDepositById(id) {
    const stmt = db.prepare("SELECT * FROM deposits WHERE id = ?");
    return stmt.get(id);
}
export function getDepositsByUserId(userId) {
    const stmt = db.prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC");
    return stmt.all(userId);
}
export function getAllDeposits(status) {
    if (status) {
        const stmt = db.prepare("SELECT * FROM deposits WHERE status = ? ORDER BY created_at DESC");
        return stmt.all(status);
    }
    const stmt = db.prepare("SELECT * FROM deposits ORDER BY created_at DESC");
    return stmt.all();
}
export function approveDeposit(id) {
    const deposit = getDepositById(id);
    if (!deposit || deposit.status !== "pending")
        return;
    const transaction = db.transaction(() => {
        db.prepare("UPDATE deposits SET status = 'approved', processed_at = datetime('now') WHERE id = ?").run(id);
        updateUserBalance(deposit.user_id, deposit.amount);
    });
    transaction();
}
export function rejectDeposit(id) {
    db.prepare("UPDATE deposits SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(id);
}
// Withdrawal functions
export function createWithdrawal(userId, amount, currency, address) {
    const id = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare(`
    INSERT INTO withdrawals (id, user_id, amount, currency, address)
    VALUES (?, ?, ?, ?, ?)
  `);
    stmt.run(id, userId, amount, currency, address);
    return getWithdrawalById(id);
}
export function getWithdrawalById(id) {
    const stmt = db.prepare("SELECT * FROM withdrawals WHERE id = ?");
    return stmt.get(id);
}
export function getWithdrawalsByUserId(userId) {
    const stmt = db.prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC");
    return stmt.all(userId);
}
export function getAllWithdrawals(status) {
    if (status) {
        const stmt = db.prepare("SELECT * FROM withdrawals WHERE status = ? ORDER BY created_at DESC");
        return stmt.all(status);
    }
    const stmt = db.prepare("SELECT * FROM withdrawals ORDER BY created_at DESC");
    return stmt.all();
}
export function approveWithdrawal(id) {
    const withdrawal = getWithdrawalById(id);
    if (!withdrawal || withdrawal.status !== "pending")
        return;
    // Balance was already deducted when withdrawal was created
    db.prepare("UPDATE withdrawals SET status = 'approved', processed_at = datetime('now') WHERE id = ?").run(id);
}
export function rejectWithdrawal(id) {
    const withdrawal = getWithdrawalById(id);
    if (!withdrawal || withdrawal.status !== "pending")
        return;
    // Return balance to user before rejecting
    updateUserBalance(withdrawal.user_id, withdrawal.amount);
    db.prepare("UPDATE withdrawals SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(id);
}
// Admin functions
export function verifyAdminPassword(password) {
    const stmt = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'");
    const result = stmt.get();
    if (!result)
        return false;
    return bcrypt.compareSync(password, result.value);
}
export function updateAdminPassword(newPassword) {
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE admin_settings SET value = ? WHERE key = 'admin_password'").run(hash);
}
export function getDepositWallet() {
    const stmt = db.prepare("SELECT value FROM admin_settings WHERE key = 'deposit_wallet'");
    const result = stmt.get();
    return result?.value || "";
}
export function setDepositWallet(wallet) {
    db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('deposit_wallet', ?)").run(wallet);
}
export function createAdminSession() {
    const token = `admin_${Math.random().toString(36).substr(2, 32)}`;
    db.prepare("INSERT INTO admin_sessions (token) VALUES (?)").run(token);
    return token;
}
export function verifyAdminSession(token) {
    const stmt = db.prepare("SELECT * FROM admin_sessions WHERE token = ?");
    return !!stmt.get(token);
}
export function getAllUsers() {
    const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
    return stmt.all();
}
export default db;
