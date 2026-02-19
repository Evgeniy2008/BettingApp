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

// Default admin password: Admin@2024!Secure#Pass
// Generate hash on first run if not exists
const adminPassword = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'").get();
if (!adminPassword) {
  const defaultPassword = "Admin@2024!Secure#Pass";
  const hash = bcrypt.hashSync(defaultPassword, 10);
  db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_password', ?)").run(hash);
}

// Set default deposit wallet if not exists
const depositWallet = db.prepare("SELECT value FROM admin_settings WHERE key = 'deposit_wallet'").get();
if (!depositWallet) {
  db.prepare("INSERT INTO admin_settings (key, value) VALUES ('deposit_wallet', 'TXvQ...demo...p9')").run();
}

// Set default deposit wallets (only USDT) if not exists
const depositWallets = db.prepare("SELECT value FROM admin_settings WHERE key = 'deposit_wallets'").get();
if (!depositWallets) {
  const defaultWallets = JSON.stringify([{ currency: 'USDT', address: 'TXvQ...demo...p9' }]);
  db.prepare("INSERT INTO admin_settings (key, value) VALUES ('deposit_wallets', ?)").run(defaultWallets);
}

export interface User {
  id: string;
  telegram_id: string | null;
  telegram_username: string | null;
  session_token: string;
  balance: number;
  credit_limit: number;
  total_staked: number;
  created_at: string;
}

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  tx_hash: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  processed_at: string | null;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  address: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  processed_at: string | null;
}

// User functions
export function createUser(telegramId?: string, telegramUsername?: string): User {
  const id = `u${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const sessionToken = `sess_${Math.random().toString(36).substr(2, 32)}`;
  
  const stmt = db.prepare(`
    INSERT INTO users (id, telegram_id, telegram_username, session_token)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(id, telegramId || null, telegramUsername || null, sessionToken);
  
  return getUserBySessionToken(sessionToken)!;
}

export function getUserBySessionToken(token: string): User | null {
  const stmt = db.prepare("SELECT * FROM users WHERE session_token = ?");
  return stmt.get(token) as User | null;
}

export function getUserById(id: string): User | null {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id) as User | null;
}

export function updateUserBalance(userId: string, amount: number): void {
  const stmt = db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
  stmt.run(amount, userId);
}

// Deposit functions
export function createDeposit(userId: string, amount: number, currency: string, txHash: string): Deposit {
  const id = `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const stmt = db.prepare(`
    INSERT INTO deposits (id, user_id, amount, currency, tx_hash)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, amount, currency, txHash);
  
  return getDepositById(id)!;
}

export function getDepositById(id: string): Deposit | null {
  const stmt = db.prepare("SELECT * FROM deposits WHERE id = ?");
  return stmt.get(id) as Deposit | null;
}

export function getDepositsByUserId(userId: string): Deposit[] {
  const stmt = db.prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC");
  return stmt.all(userId) as Deposit[];
}

export function getAllDeposits(status?: string): Deposit[] {
  if (status) {
    const stmt = db.prepare("SELECT * FROM deposits WHERE status = ? ORDER BY created_at DESC");
    return stmt.all(status) as Deposit[];
  }
  const stmt = db.prepare("SELECT * FROM deposits ORDER BY created_at DESC");
  return stmt.all() as Deposit[];
}

export function approveDeposit(id: string): void {
  const deposit = getDepositById(id);
  if (!deposit || deposit.status !== "pending") return;
  
  const transaction = db.transaction(() => {
    db.prepare("UPDATE deposits SET status = 'approved', processed_at = datetime('now') WHERE id = ?").run(id);
    updateUserBalance(deposit.user_id, deposit.amount);
  });
  
  transaction();
}

export function rejectDeposit(id: string): void {
  db.prepare("UPDATE deposits SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(id);
}

// Withdrawal functions
export function createWithdrawal(userId: string, amount: number, currency: string, address: string): Withdrawal {
  const id = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const stmt = db.prepare(`
    INSERT INTO withdrawals (id, user_id, amount, currency, address)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, userId, amount, currency, address);
  
  return getWithdrawalById(id)!;
}

export function getWithdrawalById(id: string): Withdrawal | null {
  const stmt = db.prepare("SELECT * FROM withdrawals WHERE id = ?");
  return stmt.get(id) as Withdrawal | null;
}

export function getWithdrawalsByUserId(userId: string): Withdrawal[] {
  const stmt = db.prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC");
  return stmt.all(userId) as Withdrawal[];
}

export function getAllWithdrawals(status?: string): Withdrawal[] {
  if (status) {
    const stmt = db.prepare("SELECT * FROM withdrawals WHERE status = ? ORDER BY created_at DESC");
    return stmt.all(status) as Withdrawal[];
  }
  const stmt = db.prepare("SELECT * FROM withdrawals ORDER BY created_at DESC");
  return stmt.all() as Withdrawal[];
}

export function approveWithdrawal(id: string): void {
  const withdrawal = getWithdrawalById(id);
  if (!withdrawal || withdrawal.status !== "pending") return;
  
  // Balance was already deducted when withdrawal was created
  db.prepare("UPDATE withdrawals SET status = 'approved', processed_at = datetime('now') WHERE id = ?").run(id);
}

export function rejectWithdrawal(id: string): void {
  const withdrawal = getWithdrawalById(id);
  if (!withdrawal || withdrawal.status !== "pending") return;
  
  // Return balance to user before rejecting
  updateUserBalance(withdrawal.user_id, withdrawal.amount);
  db.prepare("UPDATE withdrawals SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(id);
}

// Admin functions
export function verifyAdminPassword(password: string): boolean {
  const stmt = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_password'");
  const result = stmt.get() as { value: string } | undefined;
  if (!result) {
    console.log('[Admin] No password hash found in DB');
    return false;
  }
  const isValid = bcrypt.compareSync(password, result.value);
  console.log(`[Admin] Password verification: ${isValid ? 'valid' : 'invalid'}`);
  return isValid;
}

export function updateAdminPassword(newPassword: string): void {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE admin_settings SET value = ? WHERE key = 'admin_password'").run(hash);
}

export function getDepositWallet(): string {
  const stmt = db.prepare("SELECT value FROM admin_settings WHERE key = 'deposit_wallet'");
  const result = stmt.get() as { value: string } | undefined;
  return result?.value || "";
}

export function setDepositWallet(wallet: string): void {
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('deposit_wallet', ?)").run(wallet);
}

// Wallet management functions (multiple wallets per currency)
export interface DepositWallet {
  currency: string;
  address: string;
}

export function getDepositWallets(): DepositWallet[] {
  const stmt = db.prepare("SELECT value FROM admin_settings WHERE key = 'deposit_wallets'");
  const result = stmt.get() as { value: string } | undefined;
  if (!result || !result.value) {
    // Return default USDT wallet if none exist
    const defaultWallet = getDepositWallet();
    if (defaultWallet) {
      return [{ currency: 'USDT', address: defaultWallet }];
    }
    return [];
  }
  try {
    return JSON.parse(result.value) as DepositWallet[];
  } catch {
    return [];
  }
}

export function setDepositWallets(wallets: DepositWallet[]): void {
  const json = JSON.stringify(wallets);
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('deposit_wallets', ?)").run(json);
}

export function getDepositWalletByCurrency(currency: string): string {
  const wallets = getDepositWallets();
  const wallet = wallets.find(w => w.currency === currency);
  if (wallet) return wallet.address;
  
  // Fallback to default wallet
  return getDepositWallet();
}

export function createAdminSession(): string {
  const token = `admin_${Math.random().toString(36).substr(2, 32)}`;
  db.prepare("INSERT INTO admin_sessions (token) VALUES (?)").run(token);
  return token;
}

export function verifyAdminSession(token: string): boolean {
  const stmt = db.prepare("SELECT * FROM admin_sessions WHERE token = ?");
  return !!stmt.get(token);
}

export function getAllUsers(): User[] {
  const stmt = db.prepare("SELECT * FROM users ORDER BY created_at DESC");
  return stmt.all() as User[];
}

export default db;
