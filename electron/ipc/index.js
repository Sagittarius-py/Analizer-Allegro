const { ipcMain } = require('electron');
let repo = null;
try {
  const dbEnabled = process.env.ELECTRON_ENABLE_DB !== 'false' && !process.env.SKIP_DB;
  if (dbEnabled) {
    repo = require('../db/repository');
  }
} catch (err) {
  console.warn('Failed to load DB repository:', err.message);
}
const ordersParser = require('../importers/ordersParser');
const billingParser = require('../importers/billingParser');
const fs = require('fs');
const path = require('path');

// Stub for when DB is disabled in dev mode
const repoStub = {
  getDatabaseInfo: () => ({ error: 'DB disabled in dev mode' }),
  listImports: () => [],
  getMetricsSummary: () => ({ error: 'DB disabled in dev mode' }),
  getSetting: () => null,
  setSetting: () => {},
  listSettings: () => [],
  deleteSetting: () => 0,
  listOrders: () => [],
  getOrderDetails: () => null,
  computeHash: (content) => require('crypto').createHash('sha256').update(content).digest('hex'),
  findImportByHash: () => null,
  insertImportRecord: () => 0,
  insertOrders: () => 0,
  insertBillingOperations: () => 0,
  getCostsBreakdown: () => ({ error: 'DB disabled in dev mode' }),
  getProductBreakdown: () => [],
  getTrendsData: () => [],
  saveReport: () => 0,
  listReports: () => [],
  getReport: () => null,
  deleteReport: () => 0,
  pinReport: () => 0
};

const useRepo = repo || repoStub;

function registerIpcHandlers() {
  ipcMain.handle('database:getInfo', async () => {
    return useRepo.getDatabaseInfo();
  });

  ipcMain.handle('imports:list', async (event, limit = 100) => {
    return useRepo.listImports(limit);
  });

  ipcMain.handle('metrics:getSummary', async (event, opts = {}) => {
    try {
      return useRepo.getMetricsSummary(opts);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:get', async (event, key) => {
    try {
      return useRepo.getSetting(key);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:set', async (event, key, value) => {
    try {
      useRepo.setSetting(key, value);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:list', async () => {
    try {
      return useRepo.listSettings();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:delete', async (event, key) => {
    try {
      const changes = useRepo.deleteSetting(key);
      return { deleted: changes };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:exportDb', async (event) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const dbInfo = useRepo.getDatabaseInfo();
      const defaultName = `allegro-db-backup-${new Date().toISOString().slice(0,10)}.db`;
      const res = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'SQLite', extensions: ['db', 'sqlite'] }] });
      if (res.canceled) return { canceled: true };
      fs.copyFileSync(dbInfo.path, res.filePath);
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:validatePath', async (event, p) => {
    const fs = require('fs');
    try {
      const stat = fs.statSync(p);
      return { exists: true, isDirectory: stat.isDirectory() };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  ipcMain.handle('settings:selectFolder', async (event, opts = {}) => {
    const { dialog } = require('electron');
    try {
      const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (res.canceled) return { canceled: true };
      return { canceled: false, path: res.filePaths && res.filePaths[0] };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('settings:createFolder', async (event, p) => {
    const fs = require('fs');
    try {
      fs.mkdirSync(p, { recursive: true });
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('orders:list', async (event, opts = {}) => {
    try {
      return useRepo.listOrders(opts);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('orders:get', async (event, orderId) => {
    try {
      return useRepo.getOrderDetails(orderId);
    } catch (err) {
      return { error: err.message };
    }
  });

  // Parse files provided as [{ name, content }]
  ipcMain.handle('import:parseAndPreview', async (event, files = []) => {
    const previews = [];
    for (const f of files) {
      const text = f.content || '';
      const firstNonEmpty = text.split(/\r?\n/).find(l => l && l.trim());
      if (!firstNonEmpty) {
        previews.push({ fileName: f.name, error: 'empty' });
        continue;
      }
      if (firstNonEmpty.startsWith('Type,')) {
        const parsed = ordersParser.parseOrdersCsv(text);
        previews.push({ fileName: f.name, fileType: 'orders', ordersCount: parsed.orders.length, lineItemsCount: parsed.lineItems.length, sample: parsed.orders.slice(0,3) });
        continue;
      }
      if (firstNonEmpty.includes(';') && firstNonEmpty.includes('Typ operacji')) {
        const parsed = billingParser.parseBillingCsv(text);
        previews.push({ fileName: f.name, fileType: 'billing', operationsCount: parsed.operations.length, sample: parsed.operations.slice(0,3) });
        continue;
      }
      // fallback: try billing parser
      try {
        const parsed = billingParser.parseBillingCsv(text);
        previews.push({ fileName: f.name, fileType: 'billing', operationsCount: parsed.operations.length, sample: parsed.operations.slice(0,3) });
      } catch (err) {
        previews.push({ fileName: f.name, error: 'unknown_format' });
      }
    }
    return previews;
  });

  // Commit parsed files to DB
  ipcMain.handle('import:commit', async (event, files = []) => {
    const results = [];
    // optional auto-backup before making changes
    try {
      const auto = useRepo.getSetting('auto_backup');
      const backupPath = useRepo.getSetting('backup_path');
      if (auto && backupPath) {
        try {
          const dbInfo = useRepo.getDatabaseInfo();
          const ts = new Date().toISOString().replace(/[:]/g, '-');
          const dest = path.join(backupPath, `allegro-db-backup-${ts}.db`);
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(dbInfo.path, dest);
          }
        } catch (err) {
          // non-fatal: continue without backup
          console.warn('Auto-backup failed:', err && err.message);
        }
      }
    } catch (err) {
      // ignore
    }
    for (const f of files) {
      const content = f.content || '';
      const fileHash = useRepo.computeHash(content);
      const existing = useRepo.findImportByHash(fileHash);
      if (existing) {
        results.push({ fileName: f.name, status: 'duplicate', importId: existing.id });
        continue;
      }
      // parse to determine type
      const firstNonEmpty = content.split(/\r?\n/).find(l => l && l.trim());
      let fileType = 'unknown';
      let orders = [];
      let operations = [];
      if (firstNonEmpty && firstNonEmpty.startsWith('Type,')) {
        fileType = 'orders';
        const parsed = ordersParser.parseOrdersCsv(content);
        orders = parsed.orders;
      } else {
        fileType = 'billing';
        const parsed = billingParser.parseBillingCsv(content);
        operations = parsed.operations;
      }
      const importId = useRepo.insertImportRecord({ fileName: f.name, fileType, rowCount: (orders.length || operations.length), fileHash });
      let insertedOrders = 0;
      let insertedOps = 0;
      if (orders.length) insertedOrders = useRepo.insertOrders(importId, orders);
      if (operations.length) insertedOps = useRepo.insertBillingOperations(importId, operations);
      results.push({ fileName: f.name, status: 'imported', importId, insertedOrders, insertedOperations: insertedOps });
    }
    return results;
  });

  ipcMain.handle('import:selectFiles', async (event, opts = {}) => {
    const { dialog } = require('electron');
    const fs = require('fs');
    const path = require('path');
    try {
      const dialogOpts = {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }]
      };
      if (opts && opts.defaultPath) dialogOpts.defaultPath = opts.defaultPath;
      const res = await dialog.showOpenDialog(dialogOpts);
      if (res.canceled) return [];
      const files = [];
      for (const p of res.filePaths) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          files.push({ name: path.basename(p), content, path: p });
        } catch (err) {
          files.push({ name: path.basename(p), error: err.message, path: p });
        }
      }
      return files;
    } catch (err) {
      return { error: err.message };
    }
  });

  // Phase 7: Costs, products, trends
  ipcMain.handle('costs:breakdown', async () => {
    try {
      return useRepo.getCostsBreakdown();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('products:breakdown', async () => {
    try {
      return useRepo.getProductBreakdown();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('trends:data', async (event, days = 30) => {
    try {
      return useRepo.getTrendsData(days);
    } catch (err) {
      return { error: err.message };
    }
  });

  // Phase 7b: Saved reports
  ipcMain.handle('reports:save', async (event, name, dateFrom, dateTo, metricsSnapshot) => {
    try {
      const id = useRepo.saveReport(name, dateFrom, dateTo, metricsSnapshot);
      return { ok: true, id };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('reports:list', async (event, limit = 50) => {
    try {
      return useRepo.listReports(limit);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('reports:get', async (event, id) => {
    try {
      return useRepo.getReport(id);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('reports:delete', async (event, id) => {
    try {
      const deleted = useRepo.deleteReport(id);
      return { deleted };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('reports:pin', async (event, id, pinned) => {
    try {
      const changed = useRepo.pinReport(id, pinned);
      return { changed };
    } catch (err) {
      return { error: err.message };
    }
  });
}

module.exports = { registerIpcHandlers };
