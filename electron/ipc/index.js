const { app, ipcMain } = require('electron');
let repo = null;
try {
  const dbEnabled = !process.env.SKIP_DB && (app.isPackaged || process.env.ELECTRON_ENABLE_DB === '1');
  if (dbEnabled) {
    repo = require('../db/repository');
  }
} catch (err) {
  console.warn('Failed to load DB repository:', err.message);
}
const ordersParser = require('../importers/ordersParser');
const billingParser = require('../importers/billingParser');
const { detectReportType } = require('../importers/detectReportType');
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
  linkBillingOperationsToOrders: () => 0,
  insertBillingOperations: () => 0,
  getCostsBreakdown: () => ({ error: 'DB disabled in dev mode' }),
  getProductBreakdown: () => [],
  getTrendsData: () => [],
  getSourceAnalysis: () => ({
    orders: { total: 0, dateFrom: null, dateTo: null, active: 0, cancelled: 0, cancelledValue: 0, activeRevenue: 0, lineItems: 0, returnedLineItems: 0, returnedUnits: 0 },
    billing: { operations: 0, dateFrom: null, dateTo: null, orderReferences: 0, unmatchedOrderReferences: 0, grossCosts: 0, costCredits: 0, netCosts: 0, balance: null, linkedOrders: 0 }
  }),
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
      if (f.error) {
        previews.push({ fileName: f.name, error: 'file_read_error', message: f.error });
        continue;
      }
      const text = f.content || '';
      const fileType = detectReportType(text);
      if (!fileType) {
        previews.push({ fileName: f.name, error: 'unknown_format' });
        continue;
      }
      try {
        if (fileType === 'orders') {
          const parsed = ordersParser.parseOrdersCsv(text);
          previews.push({
            fileName: f.name,
            fileType,
            ordersCount: parsed.orders.length,
            lineItemsCount: parsed.lineItems.length,
            returnsQuantity: parsed.lineItems.reduce((sum, item) => sum + item.returnsQuantity, 0),
            sample: parsed.orders.slice(0, 3)
          });
        } else {
          const parsed = billingParser.parseBillingCsv(text);
          previews.push({
            fileName: f.name,
            fileType,
            operationsCount: parsed.operations.length,
            debitTotal: parsed.operations.reduce((sum, operation) => sum + Math.abs(Math.min(operation.debit, 0)), 0),
            sample: parsed.operations.slice(0, 3)
          });
        }
      } catch (err) {
        previews.push({ fileName: f.name, fileType, error: 'parse_error', message: err.message });
      }
    }
    return previews;
  });

  // Commit parsed files to DB
  ipcMain.handle('import:commit', async (event, files = []) => {
    if (!repo) {
      return files.map((file) => ({ fileName: file.name, status: 'error', error: 'database_disabled' }));
    }
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
      if (f.error) {
        results.push({ fileName: f.name, status: 'error', error: 'file_read_error', message: f.error });
        continue;
      }
      const content = f.content || '';
      const fileType = detectReportType(content);
      if (!fileType) {
        results.push({ fileName: f.name, status: 'error', error: 'unknown_format' });
        continue;
      }
      try {
        const parsed = fileType === 'orders'
          ? ordersParser.parseOrdersCsv(content)
          : billingParser.parseBillingCsv(content);
        const rows = fileType === 'orders'
          ? parsed.orders.length + parsed.lineItems.length
          : parsed.operations.length;
        if (!rows) {
          results.push({ fileName: f.name, fileType, status: 'error', error: 'no_data_rows' });
          continue;
        }

        const fileHash = useRepo.computeHash(content);
        const existing = useRepo.findImportByHash(fileHash);
        if (existing) {
          results.push({ fileName: f.name, fileType, status: 'duplicate', importId: existing.id });
          continue;
        }

        const dates = fileType === 'orders'
          ? parsed.orders.map((order) => order.orderDate).filter(Boolean).map((date) => date.slice(0, 10))
          : parsed.operations.map((operation) => operation.operation_date).filter(Boolean).map((date) => date.slice(0, 10));
        const importId = useRepo.insertImportRecord({
          fileName: f.name,
          fileType,
          rowCount: rows,
          dateFrom: dates.length ? dates.reduce((min, date) => date < min ? date : min) : null,
          dateTo: dates.length ? dates.reduce((max, date) => date > max ? date : max) : null,
          fileHash
        });
        if (fileType === 'orders') {
          const insertedOrders = useRepo.insertOrders(importId, parsed.orders, parsed.lineItems);
          const linkedOperations = useRepo.linkBillingOperationsToOrders();
          results.push({
            fileName: f.name,
            status: 'imported',
            fileType,
            importId,
            insertedOrders,
            insertedLineItems: parsed.lineItems.length,
            linkedBillingOperations: linkedOperations
          });
        } else {
          const insertedOperations = useRepo.insertBillingOperations(importId, parsed.operations);
          results.push({ fileName: f.name, status: 'imported', fileType, importId, insertedOperations });
        }
      } catch (err) {
        results.push({ fileName: f.name, fileType, status: 'error', error: 'import_failed', message: err.message });
      }
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

  ipcMain.handle('analytics:sourceSummary', async () => {
    try {
      return useRepo.getSourceAnalysis();
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
