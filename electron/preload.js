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
    breakdown: () => ipcRenderer.invoke('costs:breakdown')
  },
  products: {
    breakdown: () => ipcRenderer.invoke('products:breakdown')
  },
  analytics: {
    sourceSummary: () => ipcRenderer.invoke('analytics:sourceSummary')
  },
  trends: {
    data: (days) => ipcRenderer.invoke('trends:data', days)
  },
  reports: {
    save: (name, dateFrom, dateTo, snapshot) => ipcRenderer.invoke('reports:save', name, dateFrom, dateTo, snapshot),
    list: (limit) => ipcRenderer.invoke('reports:list', limit),
    get: (id) => ipcRenderer.invoke('reports:get', id),
    delete: (id) => ipcRenderer.invoke('reports:delete', id),
    pin: (id, pinned) => ipcRenderer.invoke('reports:pin', id, pinned)
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
  validatePath: (p) => ipcRenderer.invoke('settings:validatePath', p),
  selectFolder: () => ipcRenderer.invoke('settings:selectFolder'),
  createFolder: (p) => ipcRenderer.invoke('settings:createFolder', p)
});
