(function() {
  'use strict';

  class AdminPanel {
    constructor() {
      this.store = null;
      this.currentFilter = 'pending';
      this.isAdminLoggedIn = false;
    }

    init(store) {
      this.store = store;
      this.checkLoginState();
      this.cacheDOM();
      this.bindEvents();
      this.render();
      
      if (this.store && typeof this.store.subscribe === 'function') {
        this.store.subscribe(() => {
          this.render();
        });
      }
    }

    checkLoginState() {
      try {
        var saved = sessionStorage.getItem('token_arena_admin_auth');
        this.isAdminLoggedIn = saved === 'true';
      } catch(e) {
        this.isAdminLoggedIn = false;
      }
    }

    cacheDOM() {
      this.container = document.getElementById('screen-admin');
      this.statPending = document.getElementById('admin-stat-pending');
      this.statApproved = document.getElementById('admin-stat-approved');
      this.statRejected = document.getElementById('admin-stat-rejected');
      this.tableBody = document.getElementById('admin-requests-tbody');
      this.filterTabs = document.querySelectorAll('.admin-filter-tab');
    }

    bindEvents() {
      if (!this.container) return;
      
      // Event delegation for filter buttons to ensure they work dynamically
      this.container.addEventListener('click', (e) => {
        var btn = e.target.closest('.admin-filter-btn');
        if (btn) {
          var filterBtns = this.container.querySelectorAll('.admin-filter-btn');
          filterBtns.forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          this.currentFilter = btn.getAttribute('data-filter') || 'pending';
          this.renderRequests();
        }
      });
    }

    render() {
      if (!this.container) return;
      
      if (!this.isAdminLoggedIn) {
        this.renderLoginScreen();
        return;
      }

      this.renderDashboard();
      this.renderStats();
      this.renderRequests();
    }

    renderLoginScreen() {
      this.container.innerHTML = `
        <div class="screen-header">
          <div class="screen-title-group">
            <h1 class="screen-title">Admin Panel Login</h1>
            <span class="screen-badge" style="background: var(--error-coral); color: #fff;">Restricted Access</span>
          </div>
          <div class="screen-subtitle">
            Please enter your admin credentials to manage withdrawal requests
          </div>
        </div>

        <div style="max-width: 440px; margin: 40px auto; background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-6);">
          <form id="admin-login-form" onsubmit="return false;" style="display: flex; flex-direction: column; gap: var(--space-4);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Admin Email ID</label>
              <input type="email" id="admin-email-input" class="input-control" placeholder="Enter admin email" value="" required />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Password</label>
              <input type="password" id="admin-password-input" class="input-control" placeholder="Enter password" value="" required />
            </div>
            <div id="admin-login-error" style="display: none; color: var(--error-coral); font-size: 0.8rem;"></div>
            <button type="submit" class="btn btn-primary btn-block btn-lg">Login as Admin</button>
          </form>
        </div>
      `;

      var form = this.container.querySelector('#admin-login-form');
      var emailInput = this.container.querySelector('#admin-email-input');
      var passwordInput = this.container.querySelector('#admin-password-input');
      var errorDiv = this.container.querySelector('#admin-login-error');

      if (form) {
        form.onsubmit = (e) => {
          e.preventDefault();
          var email = (emailInput ? emailInput.value : '').trim().toLowerCase();
          var password = (passwordInput ? passwordInput.value : '').trim();
          
          if (email === 'nishadabas3@gmail.com' && password === 'Nishant2015@') {
            this.isAdminLoggedIn = true;
            try {
              sessionStorage.setItem('token_arena_admin_auth', 'true');
            } catch(e) {}
            if (window.showToast) window.showToast('Admin logged in successfully!', 'success');
            this.render();
          } else {
            if (errorDiv) {
              errorDiv.textContent = 'Invalid email or password.';
              errorDiv.style.display = 'block';
            }
            if (window.showToast) window.showToast('Invalid admin credentials', 'error');
          }
        };
      }
    }

    renderDashboard() {
      if (!this.container.querySelector('#admin-requests-tbody')) {
        this.container.innerHTML = `
          <div class="screen-header">
            <div class="screen-title-group">
              <h1 class="screen-title">Admin Panel</h1>
              <span class="screen-badge" style="background: var(--error-coral); color: #fff;">Payout Management</span>
            </div>
            <div class="screen-subtitle">
              Review, approve or reject user withdrawal requests
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-bottom: var(--space-4);">
            <button type="button" id="admin-logout-btn" class="btn btn-outline" style="font-size: 0.8rem; padding: 4px 12px;">Logout Admin</button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
            <div style="background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-4);">
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Pending Requests</div>
              <div id="admin-stat-pending" style="font-family: var(--font-heading); font-size: 1.8rem; font-weight: 800; color: var(--warning-amber); margin-top: 4px;">0</div>
            </div>
            <div style="background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-4);">
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Total Approved Payouts</div>
              <div id="admin-stat-approved" style="font-family: var(--font-heading); font-size: 1.8rem; font-weight: 800; color: var(--success-light); margin-top: 4px;">0 Tokens</div>
            </div>
            <div style="background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-4);">
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Total Rejected</div>
              <div id="admin-stat-rejected" style="font-family: var(--font-heading); font-size: 1.8rem; font-weight: 800; color: var(--error-coral); margin-top: 4px;">0</div>
            </div>
          </div>

          <div style="background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: var(--radius-md); overflow: hidden;">
            <div style="padding: var(--space-4); border-bottom: 1px solid var(--border-line); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3);">
              <h3 style="font-size: 1.05rem; color: var(--text-white);">Withdrawal Requests Queue</h3>
              <div style="display: flex; gap: var(--space-2);">
                <button type="button" class="btn btn-outline admin-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all" style="padding: 4px 10px; font-size: 0.8rem;">All</button>
                <button type="button" class="btn btn-outline admin-filter-btn ${this.currentFilter === 'pending' ? 'active' : ''}" data-filter="pending" style="padding: 4px 10px; font-size: 0.8rem;">Pending</button>
                <button type="button" class="btn btn-outline admin-filter-btn ${this.currentFilter === 'approved' ? 'active' : ''}" data-filter="approved" style="padding: 4px 10px; font-size: 0.8rem;">Approved</button>
                <button type="button" class="btn btn-outline admin-filter-btn ${this.currentFilter === 'rejected' ? 'active' : ''}" data-filter="rejected" style="padding: 4px 10px; font-size: 0.8rem;">Rejected</button>
              </div>
            </div>
            <div style="overflow-x: auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>UPI / VPA</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Requested At</th>
                    <th style="text-align: right;">Actions</th>
                  </tr>
                </thead>
                <tbody id="admin-requests-tbody">
                </tbody>
              </table>
            </div>
          </div>
        `;
        this.cacheDOM();

        var logoutBtn = this.container.querySelector('#admin-logout-btn');
        if (logoutBtn) {
          logoutBtn.onclick = () => {
            this.isAdminLoggedIn = false;
            try {
              sessionStorage.removeItem('token_arena_admin_auth');
            } catch(e) {}
            if (window.showToast) window.showToast('Logged out from admin panel', 'info');
            this.render();
          };
        }
      }
    }

    renderStats() {
      if (!this.store) return;
      var withdrawals = this.store.getWithdrawals() || [];
      var pendingCount = 0;
      var approvedCount = 0;
      var rejectedCount = 0;

      withdrawals.forEach(w => {
        if (w.status === 'pending') pendingCount++;
        else if (w.status === 'approved') approvedCount += w.amount;
        else if (w.status === 'rejected') rejectedCount++;
      });

      if (this.statPending) this.statPending.textContent = pendingCount;
      if (this.statApproved) this.statApproved.textContent = approvedCount.toLocaleString() + ' Tokens';
      if (this.statRejected) this.statRejected.textContent = rejectedCount;
    }

    renderRequests() {
      this.cacheDOM();
      if (!this.tableBody) return;
      
      var withdrawals = this.store ? (this.store.getWithdrawals() || []) : [];

      var filtered = withdrawals.filter(w => {
        if (this.currentFilter === 'all') return true;
        return w.status === this.currentFilter;
      });

      // Update filter button active classes if rendered
      var filterBtns = this.container ? this.container.querySelectorAll('.admin-filter-btn') : [];
      filterBtns.forEach(btn => {
        if (btn.getAttribute('data-filter') === this.currentFilter) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      if (filtered.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">
              No withdrawal requests found for filter "${this.currentFilter}".
            </td>
          </tr>
        `;
        return;
      }

      this.tableBody.innerHTML = filtered.map(req => {
        var statusBadge = '';
        if (req.status === 'pending') {
          statusBadge = '<span class="badge-status-pending" style="color: var(--warning-amber); font-weight: 700;">Pending</span>';
        } else if (req.status === 'approved') {
          statusBadge = '<span class="badge-status-approved" style="color: var(--success-light); font-weight: 700;">Approved</span>';
        } else if (req.status === 'rejected') {
          statusBadge = '<span class="badge-status-rejected" style="color: var(--error-coral); font-weight: 700;">Rejected</span>';
        }

        var dateStr = '';
        try {
          dateStr = new Date(req.createdAt).toLocaleString();
        } catch (e) {
          dateStr = req.createdAt;
        }

        var actionBtns = '';
        if (req.status === 'pending') {
          actionBtns = `
            <div class="admin-action-btns" style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-success" style="padding: 4px 10px; font-size: 0.78rem;" onclick="window.adminPanelInstance.handleAction('${req.id}', 'approve')">Approve</button>
              <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.78rem;" onclick="window.adminPanelInstance.handleAction('${req.id}', 'reject')">Reject</button>
            </div>
          `;
        } else {
          actionBtns = `<span style="font-size: 0.8rem; color: var(--text-muted); text-align: right; display: block;">Completed</span>`;
        }

        return `
          <tr>
            <td><code style="color: var(--electric-cyan); font-size: 0.8rem;">${req.id}</code></td>
            <td><span style="font-family: monospace; color: var(--text-white);">${this.escapeHtml(req.upiId)}</span></td>
            <td><strong style="color: var(--text-white);">${req.amount.toLocaleString()} Tokens</strong></td>
            <td>${statusBadge}</td>
            <td style="font-size: 0.82rem; color: var(--text-muted);">${dateStr}</td>
            <td style="text-align: right;">${actionBtns}</td>
          </tr>
        `;
      }).join('');
    }

    handleAction(requestId, action) {
      if (!this.store) return;

      if (action === 'approve') {
        var res = this.store.approveWithdrawal(requestId);
        if (res.success) {
          if (window.showToast) window.showToast('Withdrawal request approved successfully.', 'success');
          if (window.appSound) window.appSound.playWin();
        } else {
          if (window.showToast) window.showToast(res.reason || 'Failed to approve request.', 'error');
        }
      } else if (action === 'reject') {
        var res = this.store.rejectWithdrawal(requestId);
        if (res.success) {
          if (window.showToast) window.showToast('Withdrawal request rejected and tokens refunded to user.', 'info');
          if (window.appSound) window.appSound.playLoss();
        } else {
          if (window.showToast) window.showToast(res.reason || 'Failed to reject request.', 'error');
        }
      }

      this.render();
    }

    escapeHtml(str) {
      if (!str) return '';
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }

  window.AdminPanel = AdminPanel;
})();
