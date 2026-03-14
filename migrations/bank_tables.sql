-- ČSOB bankovní integrace — DB migrace
-- Spustit jako uživatel s právy na schema provider
-- Příkaz: psql -h data.euro-sped.cz -U <admin_user> -d "EURO-SPED-PROVIDER-CZ" -f bank_tables.sql

CREATE TABLE IF NOT EXISTS provider.bank_statements (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  account_iban TEXT,
  account_number TEXT,
  period_from DATE,
  period_to DATE,
  opening_balance NUMERIC(15,2),
  closing_balance NUMERIC(15,2),
  currency TEXT DEFAULT 'CZK',
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider.bank_transactions (
  id SERIAL PRIMARY KEY,
  statement_id INTEGER REFERENCES provider.bank_statements(id) ON DELETE CASCADE,
  entry_ref TEXT,
  transaction_date DATE,
  value_date DATE,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT DEFAULT 'CZK',
  credit_debit TEXT,
  counterparty_name TEXT,
  counterparty_iban TEXT,
  vs TEXT,
  ks TEXT,
  ss TEXT,
  remittance_info TEXT,
  matched_invoice_id INTEGER,
  matched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_stmt    ON provider.bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date    ON provider.bank_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched ON provider.bank_transactions(matched_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_vs      ON provider.bank_transactions(vs);

-- Práva pro sys_anon
GRANT SELECT, INSERT, UPDATE, DELETE ON provider.bank_statements    TO sys_anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider.bank_transactions  TO sys_anon;
GRANT USAGE, SELECT ON SEQUENCE provider.bank_statements_id_seq    TO sys_anon;
GRANT USAGE, SELECT ON SEQUENCE provider.bank_transactions_id_seq  TO sys_anon;
