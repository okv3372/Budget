import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BudgetService } from './service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const service = new BudgetService();

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#f4f0e6',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    const htmlPath = path.join(__dirname, '../../dist/renderer/index.html');
    void window.loadFile(htmlPath);
  }

  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle('importCsvFiles', async (_event, files) => service.importCsvFiles(files));
  ipcMain.handle('getTransactions', async (_event, filters) => service.getTransactions(filters));
  ipcMain.handle('updateTransaction', async (_event, input) => service.updateTransaction(input));
  ipcMain.handle('updateTransactions', async (_event, input) => service.updateTransactions(input));
  ipcMain.handle('softDeleteTransaction', async (_event, input) => service.softDeleteTransaction(input));
  ipcMain.handle('softDeleteTransactions', async (_event, input) => service.softDeleteTransactions(input));
  ipcMain.handle('undoDeleteTransaction', async (_event, input) => service.undoDeleteTransaction(input));
  ipcMain.handle('undoDeleteTransactions', async (_event, input) => service.undoDeleteTransactions(input));
  ipcMain.handle('getRules', async () => service.getRules());
  ipcMain.handle('createRule', async (_event, input) => service.createRule(input));
  ipcMain.handle('updateRule', async (_event, input) => service.updateRule(input));
  ipcMain.handle('deleteRule', async (_event, input) => service.deleteRule(input));
  ipcMain.handle('reorderRules', async (_event, input) => service.reorderRules(input));
  ipcMain.handle('runRules', async (_event, scope) => service.runRules(scope));
  ipcMain.handle('getBudgets', async () => service.getBudgets());
  ipcMain.handle('setBudget', async (_event, category, weeklyLimit) => service.setBudget(category, weeklyLimit));
  ipcMain.handle('getSettings', async () => service.getSettings());
  ipcMain.handle('updateSettings', async (_event, settings) => service.updateSettings(settings));
  ipcMain.handle('getDashboardMetrics', async (_event, range) => service.getDashboardMetrics(range));
  ipcMain.handle('exportTransactionsCsv', async (_event, filters) => service.exportTransactionsCsv(filters));
  ipcMain.handle('exportDashboardSummaryCsv', async (_event, range) => service.exportDashboardSummaryCsv(range));
  ipcMain.handle('applySubscriptionSuggestion', async (_event, merchantKey) => service.applySubscriptionSuggestion(merchantKey));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
