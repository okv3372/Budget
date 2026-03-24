import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/types.js';

const api: AppApi = {
  importCsvFiles: (files) => ipcRenderer.invoke('importCsvFiles', files),
  getTransactions: (filters) => ipcRenderer.invoke('getTransactions', filters),
  createManualTransaction: (input) => ipcRenderer.invoke('createManualTransaction', input),
  updateTransaction: (input) => ipcRenderer.invoke('updateTransaction', input),
  updateTransactions: (input) => ipcRenderer.invoke('updateTransactions', input),
  softDeleteTransaction: (input) => ipcRenderer.invoke('softDeleteTransaction', input),
  softDeleteTransactions: (input) => ipcRenderer.invoke('softDeleteTransactions', input),
  undoDeleteTransaction: (input) => ipcRenderer.invoke('undoDeleteTransaction', input),
  undoDeleteTransactions: (input) => ipcRenderer.invoke('undoDeleteTransactions', input),
  getRules: () => ipcRenderer.invoke('getRules'),
  createRule: (rule) => ipcRenderer.invoke('createRule', rule),
  updateRule: (rule) => ipcRenderer.invoke('updateRule', rule),
  deleteRule: (input) => ipcRenderer.invoke('deleteRule', input),
  reorderRules: (input) => ipcRenderer.invoke('reorderRules', input),
  runRules: (scope) => ipcRenderer.invoke('runRules', scope),
  getBudgets: () => ipcRenderer.invoke('getBudgets'),
  setBudget: (category, weeklyLimit) => ipcRenderer.invoke('setBudget', category, weeklyLimit),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  updateSettings: (settings) => ipcRenderer.invoke('updateSettings', settings),
  getDashboardMetrics: (range) => ipcRenderer.invoke('getDashboardMetrics', range),
  exportTransactionsCsv: (filters) => ipcRenderer.invoke('exportTransactionsCsv', filters),
  exportDashboardSummaryCsv: (range) => ipcRenderer.invoke('exportDashboardSummaryCsv', range),
  applySubscriptionSuggestion: (merchantKey) => ipcRenderer.invoke('applySubscriptionSuggestion', merchantKey)
};

contextBridge.exposeInMainWorld('budgetApi', api);
