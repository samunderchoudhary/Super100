(function() {
  'use strict';

  class TokenArenaApp {
    constructor() {
      this.store = null;
      this.sound = null;
      this.crashGame = null;
      this.teenPattiGame = null;
      this.highBidGame = null;
      this.adminPanel = null;
    }

    init() {
      // 1. Initialize Store and Audio System
      this.store = new window.TokenStore();
      this.sound = new window.SoundFX();

      // Expose globally for components and sound triggers
      window.TokenStoreInstance = this.store;
      window.appSound = this.sound;

      // 2. Initialize Header Navigation, Daily Claim, Top-Up, & Withdrawal Modal Workflow
      if (typeof window.initHeaderNav === 'function') {
        window.initHeaderNav(this.store);
      }
      if (typeof window.initDailyClaim === 'function') {
        window.initDailyClaim(this.store);
      }
      if (typeof window.initTopUpModal === 'function') {
        window.initTopUpModal(this.store);
      }
      if (typeof window.initWithdrawModal === 'function') {
        window.initWithdrawModal(this.store);
      }

      // Bind Top-Up button if exposed separately
      var buyTokensBtns = document.querySelectorAll('#buy-tokens-btn, #buy-tokens-nav-btn, #topup-nav-btn');
      buyTokensBtns.forEach((btn) => {
        if (typeof window.openTopUpModal === 'function') {
          btn.addEventListener('click', () => {
            window.openTopUpModal(this.store);
          });
        }
      });

      // Bind Withdrawal button
      var withdrawalBtns = document.querySelectorAll('#withdrawal-nav-btn, #withdrawal-btn');
      withdrawalBtns.forEach((btn) => {
        if (typeof window.openWithdrawModal === 'function') {
          btn.addEventListener('click', () => {
            window.openWithdrawModal(this.store);
          });
        }
      });

      // Check for Razorpay payment return
      if (window.Payments && typeof window.Payments.returned === 'function') {
        window.Payments.returned().then(function(res) {
          if (res && res.status === 'PAID') {
            var tokenCount = Number(res.amount) * 10;
            window.TokenStoreInstance.updateBalance(tokenCount, 'Purchased via Razorpay (Order #' + res.orderId + ')', res.orderId, 'Razorpay');
            if (typeof window.showToast === 'function') {
              window.showToast('Payment successful! Added ' + tokenCount.toLocaleString() + ' demo tokens.', 'success');
            }
          } else if (res && res.status && res.status !== 'PAID') {
            if (typeof window.showToast === 'function') {
              window.showToast('Payment ' + res.status.toLowerCase() + ': ' + (res.message || ''), 'warning');
            }
          }
        }).catch(function(err) {
          console.warn('Payment return check error:', err);
        });
      }

      // 3. Initialize Game Instances & Admin Panel
      if (window.CrashGame) {
        this.crashGame = new window.CrashGame(this.store, this.sound);
        this.crashGame.init();
      }

      if (window.TeenPattiGame) {
        this.teenPattiGame = new window.TeenPattiGame();
        this.teenPattiGame.init(this.store, this.sound);
      }

      if (window.HighBidGame) {
        this.highBidGame = new window.HighBidGame();
        this.highBidGame.init(this.store, this.sound);
      }

      if (window.AdminPanel) {
        this.adminPanel = new window.AdminPanel();
        this.adminPanel.init(this.store);
      }

      // 4. Setup Router & Hash Navigation
      this.setupRouter();
    }

    setupRouter() {
      var self = this;

      function handleRoute() {
        var hash = window.location.hash.replace('#', '') || 'screen-crash';
        var validScreens = ['screen-crash', 'screen-teenpatti', 'screen-highbid', 'screen-admin'];

        var targetScreenId = validScreens.indexOf(hash) !== -1 ? hash : 'screen-crash';

        // Update active screens
        var screens = document.querySelectorAll('.game-screen');
        screens.forEach(function(screen) {
          if (screen.id === targetScreenId) {
            screen.classList.add('active');
          } else {
            screen.classList.remove('active');
          }
        });

        // Update active nav tabs
        var navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(function(tab) {
          var target = tab.getAttribute('data-target');
          if (target === targetScreenId) {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });

        // If admin screen is opened, refresh requests list
        if (targetScreenId === 'screen-admin' && self.adminPanel && typeof self.adminPanel.renderRequests === 'function') {
          self.adminPanel.renderRequests();
        }
      }

      window.addEventListener('hashchange', handleRoute);

      // Handle initial route on load
      if (!window.location.hash) {
        window.location.hash = '#screen-crash';
      } else {
        handleRoute();
      }
    }

    resetAppData() {
      try {
        localStorage.clear();
        window.location.reload();
      } catch (e) {
        console.warn('Error resetting app data:', e);
      }
    }
  }

  // Initialize when DOM is fully loaded
  document.addEventListener('DOMContentLoaded', function() {
    var app = new TokenArenaApp();
    app.init();
    window.TokenArena = app;
  });

})();
