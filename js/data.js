// ============================================================
//  data.js  —  API client (Google Apps Script + Google Sheets)
//              Replaces the previous localStorage implementation
// ============================================================

const DataManager = {
  _cache:    null,   // in-memory data cache (refreshed on every mutate)
  _noConfig: false,  // true when config.js URL is not filled in

  // ── Init / Refresh ─────────────────────────────────────────

  async init() {
    const url = (window.CONFIG || {}).APPS_SCRIPT_URL || '';
    if (!url || url.trim() === '' || url.includes('PASTE_YOUR')) {
      this._noConfig = true;
      return;
    }
    this._noConfig = false;
    await this.refresh();
  },

  async refresh() {
    const url = (window.CONFIG || {}).APPS_SCRIPT_URL;
    // Cache-busting query param so browsers don't serve a stale response
    const resp = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now());
    if (!resp.ok) throw new Error(`Server returned ${resp.status}. Check your Apps Script URL.`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    this._cache = data;
    return data;
  },

  // ── Internal POST helper ────────────────────────────────────

  async _post(payload) {
    const url = (window.CONFIG || {}).APPS_SCRIPT_URL;
    // Use text/plain to avoid CORS preflight; Apps Script handles it fine
    const resp = await fetch(url, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const result = await resp.json();
    if (result.error) throw new Error(result.error);
    return result;
  },

  // ── Sync reads (from cache) ─────────────────────────────────

  getData()      { return this._cache; },
  isSetupDone()  { return this._cache?.fund?.setupDone || false; },

  getBalance() {
    const data = this._cache;
    if (!data) return 0;
    let bal = data.fund.initialBalance;
    data.transactions.forEach(t => {
      if (t.status === 'approved')
        bal += t.type === 'replenishment' ? t.amount : -t.amount;
    });
    return bal;
  },

  getPendingCount() {
    return (this._cache?.transactions || []).filter(t => t.status === 'pending').length;
  },

  getMonthlyStats() {
    if (!this._cache) return { expenses: 0, replenishments: 0 };
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    const monthly = this._cache.transactions.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return t.status === 'approved' && d.getMonth() === m && d.getFullYear() === y;
    });
    return {
      expenses:       monthly.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      replenishments: monthly.filter(t => t.type === 'replenishment').reduce((s, t) => s + t.amount, 0)
    };
  },

  getFilteredTransactions(filters = {}) {
    let txs = this._cache?.transactions || [];
    if (filters.type     && filters.type     !== 'all') txs = txs.filter(t => t.type     === filters.type);
    if (filters.status   && filters.status   !== 'all') txs = txs.filter(t => t.status   === filters.status);
    if (filters.category && filters.category !== 'all') txs = txs.filter(t => t.category === filters.category);
    if (filters.from)  txs = txs.filter(t => t.date >= filters.from);
    if (filters.to)    txs = txs.filter(t => t.date <= filters.to);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      txs = txs.filter(t =>
        t.description.toLowerCase().includes(q) ||
        (t.reference  || '').toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)    ||
        (t.submittedBy|| '').toLowerCase().includes(q)
      );
    }
    return txs;
  },

  // ── Async mutations (post → refresh cache) ──────────────────

  async addTransaction(tx) {
    await this._post({ action: 'addTransaction', transaction: tx });
    await this.refresh();
  },

  async approveTransaction(id, notes) {
    await this._post({ action: 'approveTransaction', id, notes: notes || '' });
    await this.refresh();
  },

  async rejectTransaction(id, notes) {
    await this._post({ action: 'rejectTransaction', id, notes: notes || '' });
    await this.refresh();
  },

  async deleteTransaction(id) {
    await this._post({ action: 'deleteTransaction', id });
    await this.refresh();
  },

  async updateSettings(settings) {
    await this._post({ action: 'updateSettings', settings });
    await this.refresh();
  },

  async completeSetup(initialBalance) {
    await this.updateSettings({ initialBalance: String(initialBalance), setupDone: 'true' });
  },

  async updateInitialBalance(amount) {
    await this.updateSettings({ initialBalance: String(amount) });
  },

  // ── Export ───────────────────────────────────────────────────

  exportCSV(transactions) {
    const headers = ['Date','Type','Category','Description','Reference','Amount (₹)','Status','Notes','Submitted By'];
    const rows = transactions.map(t => [
      t.date,
      t.type.charAt(0).toUpperCase() + t.type.slice(1),
      t.category,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.reference || '',
      parseFloat(t.amount).toFixed(2),
      t.status.charAt(0).toUpperCase() + t.status.slice(1),
      `"${(t.notes || '').replace(/"/g, '""')}"`,
      t.submittedBy || ''
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }
};
