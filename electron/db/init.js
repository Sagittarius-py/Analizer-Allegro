const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function initDatabase(app) {
  const userData = app.getPath('userData');
  const folder = path.join(userData, 'allegro-profit-analyzer');
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  const dbPath = path.join(folder, 'database.db');

  const db = new Database(dbPath);

  // Create tables according to data_model (minimal columns implemented)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY,
      file_name TEXT,
      file_type TEXT,
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      row_count INTEGER,
      date_range_from DATE,
      date_range_to DATE,
      file_hash TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      order_date DATETIME,
      seller_status TEXT,
      marketplace TEXT,
      payment_amount REAL,
      payment_currency TEXT,
      fulfillment_provider TEXT,
      import_id INTEGER,
      FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS line_items (
      line_item_id TEXT PRIMARY KEY,
      returns_quantity INTEGER,
      import_id INTEGER,
      FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS operation_category_map (
      operation_type TEXT PRIMARY KEY,
      category TEXT,
      is_cost BOOLEAN
    );

    CREATE TABLE IF NOT EXISTS billing_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_date DATETIME,
      offer_name TEXT,
      offer_id TEXT,
      operation_type TEXT,
      operation_category TEXT,
      credit REAL DEFAULT 0,
      debit REAL DEFAULT 0,
      balance REAL,
      raw_details TEXT,
      related_order_id TEXT,
      service_code TEXT,
      service_name TEXT,
      waybill_number TEXT,
      is_smart_delivery INTEGER,
      import_id INTEGER,
      FOREIGN KEY(related_order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
      FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS product_cost (
      offer_id TEXT PRIMARY KEY,
      offer_name TEXT,
      sku TEXT,
      unit_cost REAL,
      sale_price_net REAL,
      purchase_vat_rate REAL NOT NULL DEFAULT 23,
      sales_vat_rate REAL NOT NULL DEFAULT 23,
      vat_deductible_percent REAL NOT NULL DEFAULT 100,
      is_auto_discovered INTEGER NOT NULL DEFAULT 0,
      vat_verified INTEGER NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'PLN',
      notes TEXT,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS saved_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      metrics_snapshot TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const productColumns = new Set(db.prepare('PRAGMA table_info(product_cost)').all().map((column) => column.name));
  const productMigrations = [
    ['sku', 'TEXT'],
    ['sale_price_net', 'REAL'],
    ['purchase_vat_rate', 'REAL NOT NULL DEFAULT 23'],
    ['sales_vat_rate', 'REAL NOT NULL DEFAULT 23'],
    ['vat_deductible_percent', 'REAL NOT NULL DEFAULT 100'],
    ['is_auto_discovered', 'INTEGER NOT NULL DEFAULT 0'],
    ['vat_verified', 'INTEGER NOT NULL DEFAULT 0'],
    ['notes', 'TEXT']
  ];
  for (const [column, definition] of productMigrations) {
    if (!productColumns.has(column)) {
      db.exec(`ALTER TABLE product_cost ADD COLUMN ${column} ${definition}`);
    }
  }

  const insertCategory = db.prepare('INSERT OR IGNORE INTO operation_category_map (operation_type, category, is_cost) VALUES (?, ?, ?)');
  const seed = [
    ['Prowizja od sprzedaży','commission',1],
    ['Opłata za dostawę DPD Allegro Delivery','delivery',1],
    ['Opłata dodatkowa za dostawę DPD Allegro Delivery','delivery',1],
    ['Opłata za dostawę InPost','delivery',1],
    ['Opłata za dostawę DHL Allegro Delivery','delivery',1],
    ['Opłata za dostawę ORLEN Paczka Allegro Delivery','delivery',1],
    ['Opłata za kampanię Ads','advertising',1],
    ['Opłata za monety','other_fee',1],
    ['Abonament profesjonalny','subscription',1],
    ['Pobranie opłat z wpływów','internal',0],
    ['Podsumowanie miesiąca','internal',0]
  ];
  const seedCategories = db.transaction((rows) => {
    for (const row of rows) insertCategory.run(row[0], row[1], row[2]);
  });
  seedCategories(seed);

  db.close();
  return dbPath;
}

module.exports = { initDatabase };
