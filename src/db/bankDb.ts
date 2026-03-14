/**
 * SQLite databáze pro bankovní výpisy a transakce
 * Nevyžaduje žádná oprávnění na PostgreSQL
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

const DB_PATH = process.env.BANK_DB_PATH ?? path.resolve('/services/admin-data/bank.db')

// Zajistíme existenci adresáře
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db: DatabaseType = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Vytvoření tabulek (idempotentní)
db.exec(`
  CREATE TABLE IF NOT EXISTS bank_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    account_iban TEXT,
    account_number TEXT,
    period_from TEXT,
    period_to TEXT,
    opening_balance REAL,
    closing_balance REAL,
    currency TEXT DEFAULT 'CZK',
    downloaded_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    statement_id INTEGER NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    entry_ref TEXT,
    transaction_date TEXT,
    value_date TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'CZK',
    credit_debit TEXT,
    counterparty_name TEXT,
    counterparty_iban TEXT,
    vs TEXT,
    ks TEXT,
    ss TEXT,
    remittance_info TEXT,
    matched_invoice_id INTEGER,
    matched_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_bank_tx_stmt    ON bank_transactions(statement_id);
  CREATE INDEX IF NOT EXISTS idx_bank_tx_date    ON bank_transactions(transaction_date DESC);
  CREATE INDEX IF NOT EXISTS idx_bank_tx_matched ON bank_transactions(matched_invoice_id);
  CREATE INDEX IF NOT EXISTS idx_bank_tx_vs      ON bank_transactions(vs);
`)

export default db
