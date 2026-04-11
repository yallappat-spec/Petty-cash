// ============================================================
//  app.js  —  Shared utilities for Petty Cash Manager
// ============================================================

const App = {

  // ── Formatting ────────────────────────────────────────────

  fmt(amount) {
    return '₹' + parseFloat(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(String(dateStr) + (String(dateStr).length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  fmtDateTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  },

  todayISO() {
    return new Date().toISOString().split('T')[0];
  },

  // ── Badges ────────────────────────────────────────────────

  statusBadge(status) {
    const map = {
      pending:  ['badge-pending',  'fa-clock',  'Pending'],
      approved: ['badge-approved', 'fa-check',  'Approved'],
      rejected: ['badge-rejected', 'fa-xmark',  'Rejected']
    };
    const [cls, icon, label] = map[status] || ['badge-secondary', 'fa-question', 'Unknown'];
    return `<span class="status-badge ${cls}"><i class="fas ${icon}"></i> ${label}</span>`;
  },

  typeBadge(type) {
    if (type === 'expense')
      return `<span class="type-badge type-expense"><i class="fas fa-arrow-up"></i> Expense</span>`;
    if (type === 'replenishment')
      return `<span class="type-badge type-replenish"><i class="fas fa-arrow-down"></i> Replenishment</span>`;
    return type;
  },

  // ── Toast ─────────────────────────────────────────────────

  toast(message, type = 'success') {
    const el  = document.getElementById('appToast');
    const msg = document.getElementById('toastMsg');
    if (!el || !msg) return;
    const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2563eb' };
    el.style.background = colors[type] || colors.success;
    msg.textContent = message;
    bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 }).show();
  },

  // ── Page loader ────────────────────────────────────────────
  //   Each page should have:  <div id="pageLoader">…</div>

  showLoader(msg) {
    const el = document.getElementById('pageLoader');
    if (!el) return;
    const txt = el.querySelector('.loader-text');
    if (txt) txt.textContent = msg || 'Loading data…';
    el.style.display = 'flex';
  },

  hideLoader() {
    const el = document.getElementById('pageLoader');
    if (el) el.style.display = 'none';
  },

  // ── "Not configured" banner ────────────────────────────────

  showConfigBanner() {
    const el = document.getElementById('configBanner');
    if (el) el.style.display = 'flex';
    const main = document.querySelector('.main-content');
    if (main) main.style.opacity = '0.3';
  },

  // ── Error banner ───────────────────────────────────────────

  showError(message) {
    const el = document.getElementById('errorBanner');
    if (!el) { alert(message); return; }
    el.querySelector('.error-msg').textContent = message;
    el.style.display = 'flex';
  },

  // ── Sidebar active state ──────────────────────────────────

  setActiveNav() {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href') || '';
      link.classList.toggle('active',
        href === page || (page === '' && href === 'index.html'));
    });
  },

  // ── Pending badge (sidebar) ────────────────────────────────

  updatePendingBadge() {
    const n     = DataManager.getPendingCount();
    const badge = document.getElementById('pendingBadge');
    if (!badge) return;
    if (n > 0) { badge.textContent = n; badge.classList.remove('d-none'); }
    else       { badge.classList.add('d-none'); }
  },

  // ── Download helper ───────────────────────────────────────

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Modal helpers ─────────────────────────────────────────

  showModal(id) { bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).show(); },
  hideModal(id) { bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).hide(); },

  // ── Sidebar (mobile) ──────────────────────────────────────

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
  },

  // ── Categories ────────────────────────────────────────────

  CATEGORIES: [
    'Food',
    'Local Travel',
    'Travel Tickets',
    'Hotel Rent',
    'Other Expenses'
  ]
};
