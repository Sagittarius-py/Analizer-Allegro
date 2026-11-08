const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('allegroAPI', {
  database: {
    getInfo: () => ipcRenderer.invoke('database:getInfo'),
    listImports: (limit) => ipcRenderer.invoke('imports:list', limit)
  ,
    orders: {
      list: (opts) => ipcRenderer.invoke('orders:list', opts),
      get: (orderId) => ipcRenderer.invoke('orders:get', orderId)
    }
  },
  costs: {
    breakdown: (options) => ipcRenderer.invoke('costs:breakdown', options)
  },
  products: {
    breakdown: (options) => ipcRenderer.invoke('products:breakdown', options),
    list: () => ipcRenderer.invoke('products:list'),
    save: (product) => ipcRenderer.invoke('products:save', product),
    delete: (offerId) => ipcRenderer.invoke('products:delete', offerId)
  },
  analytics: {
    sourceSummary: (options) => ipcRenderer.invoke('analytics:sourceSummary', options)
  },
  trends: {
    data: (days) => ipcRenderer.invoke('trends:data', days)
  },
  reports: {
    save: (name, dateFrom, dateTo, snapshot) => ipcRenderer.invoke('reports:save', name, dateFrom, dateTo, snapshot),
    list: (options) => ipcRenderer.invoke('reports:list', options),
    get: (id) => ipcRenderer.invoke('reports:get', id),
    delete: (id) => ipcRenderer.invoke('reports:delete', id),
    pin: (id, pinned) => ipcRenderer.invoke('reports:pin', id, pinned),
    exportCsv: (id) => ipcRenderer.invoke('reports:exportCsv', id)
  }
});

contextBridge.exposeInMainWorld('allegroImport', {
  parseAndPreview: (files, reportType) => ipcRenderer.invoke('import:parseAndPreview', files, reportType),
  commit: (files, reportType) => ipcRenderer.invoke('import:commit', files, reportType),
  selectFiles: (defaultPath) => ipcRenderer.invoke('import:selectFiles', { defaultPath }),
});

contextBridge.exposeInMainWorld('allegroMetrics', {
  getSummary: (opts) => ipcRenderer.invoke('metrics:getSummary', opts)
});

contextBridge.exposeInMainWorld('allegroSettings', {
  get: (key) => ipcRenderer.invoke('settings:get', key),
  set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  list: () => ipcRenderer.invoke('settings:list'),
  delete: (key) => ipcRenderer.invoke('settings:delete', key),
  exportDb: () => ipcRenderer.invoke('settings:exportDb')
  ,
  factoryReset: (confirmation) => ipcRenderer.invoke('settings:factoryReset', confirmation),
  restoreDb: () => ipcRenderer.invoke('settings:restoreDb'),
  validatePath: (p) => ipcRenderer.invoke('settings:validatePath', p),
  selectFolder: () => ipcRenderer.invoke('settings:selectFolder'),
  createFolder: (p) => ipcRenderer.invoke('settings:createFolder', p)
});
