-- Schema for the retail database (SQLite)
-- One row per invoice in invoices, one row per product line in invoice_items.

DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS returns;

CREATE TABLE customers (
    customer_id   INTEGER PRIMARY KEY,
    country       TEXT NOT NULL
);

CREATE TABLE products (
    stock_code    TEXT PRIMARY KEY,
    description   TEXT
);

CREATE TABLE invoices (
    invoice_no    TEXT PRIMARY KEY,
    invoice_date  TEXT NOT NULL,      -- stored as 'YYYY-MM-DD HH:MM:SS'
    customer_id   INTEGER,            -- NULL for guest checkouts
    country       TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE invoice_items (
    item_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no    TEXT NOT NULL,
    stock_code    TEXT NOT NULL,
    quantity      INTEGER NOT NULL,
    unit_price    REAL NOT NULL,
    FOREIGN KEY (invoice_no) REFERENCES invoices(invoice_no),
    FOREIGN KEY (stock_code) REFERENCES products(stock_code)
);

-- cancelled invoices (invoice number starts with C) are kept separately
CREATE TABLE returns (
    invoice_no    TEXT,
    invoice_date  TEXT,
    customer_id   INTEGER,
    stock_code    TEXT,
    quantity      INTEGER,
    unit_price    REAL,
    country       TEXT
);

CREATE INDEX idx_items_invoice ON invoice_items(invoice_no);
CREATE INDEX idx_items_stock ON invoice_items(stock_code);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
