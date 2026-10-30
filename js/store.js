(function() {
  'use strict';

  var STORAGE_BALANCE_KEY = 'token_arena_balance_v1';
  var STORAGE_LEDGER_KEY = 'token_arena_ledger_v1';
  var STORAGE_MUTED_KEY = 'token_arena_muted_v1';
  var STORAGE_WITHDRAWALS_KEY = 'token_arena_withdrawals_v1';
  var STORAGE_USER_PHONE_KEY = 'token_arena_user_phone_v1';
  var STORAGE_REFERRALS_KEY = 'token_arena_referrals_v1';
  var INITIAL_BALANCE = 1000;

  class TokenStore {
    constructor() {
      this.listeners = [];
      this.balance = INITIAL_BALANCE;
      this.ledger = [];
      this.withdrawals = [];
      this.userPhone = '';
      this.appliedReferrals = [];
      this.load();
    }

    load() {
      try {
        var savedBalance = localStorage.getItem(STORAGE_BALANCE_KEY);
        if (savedBalance !== null) {
          var parsed = parseInt(savedBalance, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            this.balance = parsed;
          }
        } else {
          this.balance = INITIAL_BALANCE;
          this.saveBalance();
        }

        var savedLedger = localStorage.getItem(STORAGE_LEDGER_KEY);
        if (savedLedger) {
          var parsedLedger = JSON.parse(savedLedger);
          if (Array.isArray(parsedLedger)) {
            this.ledger = parsedLedger;
          }
        }

        var savedWithdrawals = localStorage.getItem(STORAGE_WITHDRAWALS_KEY);
        if (savedWithdrawals) {
          var parsedWithdrawals = JSON.parse(savedWithdrawals);
          if (Array.isArray(parsedWithdrawals)) {
            this.withdrawals = parsedWithdrawals;
          }
        }

        var savedPhone = localStorage.getItem(STORAGE_USER_PHONE_KEY);
        if (savedPhone) {
          this.userPhone = savedPhone;
        }

        var savedRefs = localStorage.getItem(STORAGE_REFERRALS_KEY);
        if (savedRefs) {
          var parsedRefs = JSON.parse(savedRefs);
          if (Array.isArray(parsedRefs)) {
            this.appliedReferrals = parsedRefs;
          }
        }
      } catch (e) {
        console.warn('LocalStorage error in TokenStore.load:', e);
        this.balance = INITIAL_BALANCE;
        this.ledger = [];
        this.withdrawals = [];
      }
    }

    saveBalance() {
      try {
        localStorage.setItem(STORAGE_BALANCE_KEY, this.balance.toString());
      } catch (e) {
        console.warn('LocalStorage error saving balance:', e);
      }
    }

    saveLedger() {
      try {
        localStorage.setItem(STORAGE_LEDGER_KEY, JSON.stringify(this.ledger));
      } catch (e) {
        console.warn('LocalStorage error saving ledger:', e);
      }
    }

    saveWithdrawals() {
      try {
        localStorage.setItem(STORAGE_WITHDRAWALS_KEY, JSON.stringify(this.withdrawals));
      } catch (e) {
        console.warn('LocalStorage error saving withdrawals:', e);
      }
    }

    saveUserPhone() {
      try {
        localStorage.setItem(STORAGE_USER_PHONE_KEY, this.userPhone);
      } catch (e) {
        console.warn('LocalStorage error saving user phone:', e);
      }
    }

    saveReferrals() {
      try {
        localStorage.setItem(STORAGE_REFERRALS_KEY, JSON.stringify(this.appliedReferrals));
      } catch (e) {
        console.warn('LocalStorage error saving referrals:', e);
      }
    }

    setUserPhone(phone) {
      var cleaned = (phone || '').replace(/\D/g, '').trim();
      if (cleaned.length < 10) {
        return { success: false, reason: 'Please enter a valid 10-digit mobile number.' };
      }
      this.userPhone = cleaned;
      this.saveUserPhone();
      return { success: true, referralId: this.userPhone };
    }

    getUserPhone() {
      return this.userPhone;
    }

    getReferralId() {
      return this.userPhone;
    }

    applyReferral(refId) {
      var cleanedRef = (refId || '').replace(/\D/g, '').trim();
      if (!cleanedRef) {
        return { success: false, reason: 'Please enter a valid referral ID (mobile number).' };
      }

      if (this.userPhone && cleanedRef === this.userPhone) {
        return { success: false, reason: 'You cannot use your own mobile number as a referral ID.' };
      }

      if (this.appliedReferrals.includes(cleanedRef)) {
        return { success: false, reason: 'You have already applied this referral ID.' };
      }

      // Add 100 demo tokens bonus as requested
      var bonus = 100;
      this.balance += bonus;
      this.saveBalance();

      this.appliedReferrals.push(cleanedRef);
      this.saveReferrals();

      this.addLedgerEntry(null, bonus, 'Referral Bonus (Ref ID: ' + cleanedRef + ')', 'System');
      this.notify();

      return { success: true, balance: this.balance, bonus: bonus, message: 'Referral applied successfully! You received 100 bonus tokens.' };
    }

    subscribe(fn) {
      if (typeof fn === 'function') {
        this.listeners.push(fn);
      }
      return () => {
        this.listeners = this.listeners.filter(l => l !== fn);
      };
    }

    notify() {
      this.listeners.forEach(fn => {
        try {
          fn(this.balance, this.ledger);
        } catch (e) {
          console.error('Error in store listener:', e);
        }
      });
    }

    getBalance() {
      return this.balance;
    }

    getHistory() {
      return [...this.ledger];
    }

    getWithdrawals() {
      return [...this.withdrawals];
    }

    updateBalance(delta, reason, roundId = null, gameType = 'General') {
      var intDelta = Math.floor(Number(delta));
      if (isNaN(intDelta)) {
        return { success: false, reason: 'Invalid token amount', balance: this.balance };
      }

      if (intDelta < 0 && this.balance + intDelta < 0) {
        return { success: false, reason: 'Insufficient token balance', balance: this.balance };
      }

      this.balance += intDelta;
      this.saveBalance();

      var entry = this.addLedgerEntry(roundId, intDelta, reason, gameType);
      this.notify();

      return { success: true, balance: this.balance, entry: entry };
    }

    withdrawTokens(amount, upiId) {
      var intAmount = Math.floor(Number(amount));
      if (isNaN(intAmount) || intAmount <= 0) {
        return { success: false, reason: 'Please enter a valid withdrawal amount.' };
      }

      if (intAmount < 2000) {
        return { success: false, reason: 'Minimum withdrawal amount is 2000 tokens.' };
      }

      var maxWithdrawable = this.balance - 2000;
      if (maxWithdrawable < 0) {
        return { success: false, reason: 'Your balance is below the minimum required limit of 2000 tokens.' };
      }

      if (intAmount > maxWithdrawable) {
        return { success: false, reason: 'Cannot withdraw bonus or required minimum balance. Maximum available to withdraw is ' + maxWithdrawable + ' tokens (keeping 2000 minimum balance).' };
      }

      if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) {
        return { success: false, reason: 'Please provide a valid UPI ID (e.g. name@upi).' };
      }

      this.balance -= intAmount;
      this.saveBalance();

      var withdrawalReq = {
        id: 'wd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        amount: intAmount,
        upiId: upiId.trim(),
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      this.withdrawals.unshift(withdrawalReq);
      this.saveWithdrawals();

      var entry = this.addLedgerEntry(null, -intAmount, 'Withdrawal Request to UPI: ' + upiId, 'Withdrawal');
      this.notify();

      return { success: true, balance: this.balance, withdrawal: withdrawalReq, message: 'Withdrawal request of ' + intAmount + ' tokens submitted for admin approval.' };
    }

    approveWithdrawal(requestId) {
      var req = this.withdrawals.find(function(w) { return w.id === requestId; });
      if (!req) {
        return { success: false, reason: 'Withdrawal request not found.' };
      }
      if (req.status !== 'pending') {
        return { success: false, reason: 'Request is already ' + req.status + '.' };
      }

      req.status = 'approved';
      this.saveWithdrawals();
      this.addLedgerEntry(null, 0, 'Withdrawal Approved for ' + req.amount + ' tokens (' + req.upiId + ')', 'Withdrawal');
      this.notify();
      return { success: true, request: req };
    }

    rejectWithdrawal(requestId) {
      var req = this.withdrawals.find(function(w) { return w.id === requestId; });
      if (!req) {
        return { success: false, reason: 'Withdrawal request not found.' };
      }
      if (req.status !== 'pending') {
        return { success: false, reason: 'Request is already ' + req.status + '.' };
      }

      req.status = 'rejected';
      this.balance += req.amount;
      this.saveBalance();

      this.saveWithdrawals();
      this.addLedgerEntry(null, req.amount, 'Withdrawal Rejected & Refunded: ' + req.amount + ' tokens', 'Withdrawal');
      this.notify();
      return { success: true, request: req, balance: this.balance };
    }

    addLedgerEntry(roundId, delta, reason, gameType = 'General') {
      var entry = {
        id: 'led_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        roundId: roundId || 'R-' + Date.now().toString(36).toUpperCase(),
        gameType: gameType,
        delta: Math.floor(delta),
        reason: reason || 'Token Ledger Activity',
        createdAt: new Date().toISOString(),
        balanceAfter: this.balance
      };

      this.ledger.unshift(entry);
      if (this.ledger.length > 200) {
        this.ledger = this.ledger.slice(0, 200);
      }

      this.saveLedger();
      return entry;
    }

    resetBalance(amount) {
      var target = typeof amount === 'number' && amount >= 0 ? Math.floor(amount) : INITIAL_BALANCE;
      var delta = target - this.balance;
      this.balance = target;
      this.saveBalance();
      this.addLedgerEntry(null, delta, 'Demo Tokens Refilled', 'System');
      this.notify();
      return this.balance;
    }
  }

  class SoundFX {
    constructor() {
      this.ctx = null;
      this.muted = false;
      try {
        var savedMute = localStorage.getItem(STORAGE_MUTED_KEY);
        this.muted = savedMute === 'true';
      } catch (e) {
        this.muted = false;
      }
    }

    initContext() {
      if (!this.ctx) {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function() {});
      }
    }

    isMuted() {
      return this.muted;
    }

    toggleMute() {
      this.muted = !this.muted;
      try {
        localStorage.setItem(STORAGE_MUTED_KEY, this.muted.toString());
      } catch (e) {}
      return this.muted;
    }

    playTick() {
      if (this.muted) return;
      this.initContext();
      if (!this.ctx) return;

      try {
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.03);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.03);
      } catch (e) {}
    }

    playWin() {
      if (this.muted) return;
      this.initContext();
      if (!this.ctx) return;

      try {
        var now = this.ctx.currentTime;
        var notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          var osc = this.ctx.createOscillator();
          var gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);

          gain.gain.setValueAtTime(0.12, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.25);
        });
      } catch (e) {}
    }

    playLoss() {
      if (this.muted) return;
      this.initContext();
      if (!this.ctx) return;

      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
      } catch (e) {}
    }

    playCrash() {
      if (this.muted) return;
      this.initContext();
      if (!this.ctx) return;

      try {
        var now = this.ctx.currentTime;
        var osc = this.ctx.createOscillator();
        var gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.4);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
      } catch (e) {}
    }
  }

  window.TokenStore = TokenStore;
  window.SoundFX = SoundFX;
})();
