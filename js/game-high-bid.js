(function() {
  'use strict';

  class HighBidGame {
    constructor() {
      this.store = null;
      this.sound = null;
      this.currentRound = null;
      this.timerId = null;
      this.secondsRemaining = 15;
      this.roundDuration = 15;
      this.minBid = 10;
      this.maxBid = 500;
      this.isSubmitting = false;
      this.userBid = null; // { amount, receiptId, acceptedAt }
      this.botBids = [];
      this.gameState = 'IDLE'; // IDLE, OPEN, LOCKED, SETTLED
      this.botNames = ['Asha_77', 'Dev_Winner', 'Mira_X', 'ProTrader', 'ApexBidder', 'Vortex99', 'CryptoSam', 'NeoRider'];
      this.dom = {};
    }

    init(store, sound) {
      this.store = store;
      this.sound = sound;

      this.cacheDOM();
      this.bindEvents();
      this.startNewRound();
    }

    cacheDOM() {
      this.dom = {
        timerSeconds: document.getElementById('highbid-timer-seconds'),
        timerCircle: document.getElementById('highbid-timer-circle'),
        timerLabel: document.getElementById('highbid-timer-label'),
        bidCount: document.getElementById('highbid-bid-count'),
        roundIdBadge: document.getElementById('highbid-round-id'),
        
        bidInput: document.getElementById('highbid-amount-input'),
        submitBtn: document.getElementById('highbid-submit-btn'),
        presetBtns: document.querySelectorAll('.highbid-preset-btn'),
        
        userReceiptPanel: document.getElementById('highbid-user-receipt'),
        receiptRound: document.getElementById('highbid-receipt-round'),
        receiptAmount: document.getElementById('highbid-receipt-amount'),
        receiptId: document.getElementById('highbid-receipt-id'),
        
        resultPanel: document.getElementById('highbid-result-panel'),
        resultBanner: document.getElementById('highbid-result-banner'),
        resultTitle: document.getElementById('highbid-result-title'),
        resultDetail: document.getElementById('highbid-result-detail'),
        participantsList: document.getElementById('highbid-participants-list'),
        
        rulesBtn: document.getElementById('highbid-rules-btn')
      };
    }

    bindEvents() {
      var self = this;

      if (this.dom.submitBtn) {
        this.dom.submitBtn.addEventListener('click', function() {
          var val = parseInt(self.dom.bidInput ? self.dom.bidInput.value : 0, 10);
          self.placeBid(val);
        });
      }

      if (this.dom.presetBtns) {
        this.dom.presetBtns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            var val = parseInt(btn.getAttribute('data-preset'), 10);
            if (!isNaN(val) && self.dom.bidInput) {
              self.dom.bidInput.value = val;
            }
          });
        });
      }

      if (this.dom.rulesBtn) {
        this.dom.rulesBtn.addEventListener('click', function() {
          if (window.openRulesModal) {
            window.openRulesModal('highbid');
          }
        });
      }
    }

    startNewRound() {
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }

      var dateStr = Date.now().toString(36).toUpperCase();
      this.currentRound = {
        roundId: 'HB-' + dateStr,
        openAt: new Date().toISOString(),
        minBid: this.minBid,
        maxBid: this.maxBid,
        userBid: null,
        bids: []
      };

      this.userBid = null;
      this.botBids = [];
      this.gameState = 'OPEN';
      this.secondsRemaining = this.roundDuration;

      if (this.dom.roundIdBadge) {
        this.dom.roundIdBadge.textContent = this.currentRound.roundId;
      }

      if (this.dom.bidInput) {
        this.dom.bidInput.disabled = false;
        if (!this.dom.bidInput.value) {
          this.dom.bidInput.value = '50';
        }
      }

      if (this.dom.submitBtn) {
        this.dom.submitBtn.disabled = false;
        this.dom.submitBtn.textContent = 'SUBMIT SEALED BID';
      }

      if (this.dom.userReceiptPanel) {
        this.dom.userReceiptPanel.style.display = 'none';
      }

      if (this.dom.resultPanel) {
        this.dom.resultPanel.style.display = 'none';
      }

      if (this.dom.timerLabel) {
        this.dom.timerLabel.textContent = 'AUCTION CLOSING IN';
      }

      this.updateBidCountUI();
      this.startCountdown();
    }

    startCountdown() {
      var self = this;
      this.updateTimerUI();

      this.timerId = setInterval(function() {
        self.secondsRemaining--;
        self.updateTimerUI();

        if (self.sound && self.secondsRemaining <= 5 && self.secondsRemaining > 0) {
          self.sound.playTick();
        }

        // Randomly generate bot sealed bids during the window
        if (self.gameState === 'OPEN' && Math.random() > 0.45 && self.secondsRemaining > 2) {
          self.simulateBotBid();
        }

        if (self.secondsRemaining <= 0) {
          clearInterval(self.timerId);
          self.timerId = null;
          self.resolveAuction();
        }
      }, 1000);
    }

    updateTimerUI() {
      if (this.dom.timerSeconds) {
        this.dom.timerSeconds.textContent = Math.max(0, this.secondsRemaining) + 's';
      }

      if (this.dom.timerCircle) {
        var pct = (this.secondsRemaining / this.roundDuration) * 100;
        this.dom.timerCircle.style.background = `conic-gradient(var(--warning-amber) ${pct}%, var(--bg-deep-navy) ${pct}%)`;
      }
    }

    simulateBotBid() {
      if (this.botBids.length >= 6) return;

      var randomName = this.botNames[Math.floor(Math.random() * this.botNames.length)];
      if (this.botBids.some(b => b.name === randomName)) return;

      // Bot bids in multiples of 10 or 25 between minBid and maxBid
      var range = [20, 30, 50, 75, 100, 150, 200, 250, 300, 400];
      var chosenAmount = range[Math.floor(Math.random() * range.length)];

      this.botBids.push({
        playerId: 'bot_' + Math.random().toString(36).substr(2, 6),
        name: randomName,
        amount: chosenAmount,
        isBot: true,
        acceptedAt: new Date().toISOString()
      });

      this.updateBidCountUI();
    }

    updateBidCountUI() {
      var total = this.botBids.length + (this.userBid ? 1 : 0);
      if (this.dom.bidCount) {
        this.dom.bidCount.textContent = total + (total === 1 ? ' Sealed Bid' : ' Sealed Bids');
      }
    }

    placeBid(amount) {
      if (this.gameState !== 'OPEN') {
        if (window.showToast) window.showToast('Auction is not open for bidding', 'error');
        return false;
      }

      if (this.userBid) {
        if (window.showToast) window.showToast('You have already submitted a bid for this round', 'warning');
        return false;
      }

      if (isNaN(amount) || amount < this.minBid) {
        if (window.showToast) window.showToast('Minimum bid is ' + this.minBid + ' tokens', 'error');
        return false;
      }

      if (amount > this.maxBid) {
        if (window.showToast) window.showToast('Maximum bid limit is ' + this.maxBid + ' tokens', 'error');
        return false;
      }

      var balance = this.store.getBalance();
      if (amount > balance) {
        if (window.showToast) window.showToast('Insufficient demo tokens. Refill available in menu.', 'error');
        return false;
      }

      // Reserve tokens atomically
      var res = this.store.updateBalance(-amount, 'Sealed Auction Bid Submitted', this.currentRound.roundId, 'High Bid Arena');
      if (!res.success) {
        if (window.showToast) window.showToast(res.reason || 'Failed to place bid', 'error');
        return false;
      }

      var receiptId = 'RCPT-' + Date.now().toString(36).toUpperCase();
      this.userBid = {
        playerId: 'user_player',
        name: 'You (Player)',
        amount: amount,
        isBot: false,
        receiptId: receiptId,
        acceptedAt: new Date().toISOString()
      };

      if (this.dom.bidInput) this.dom.bidInput.disabled = true;
      if (this.dom.submitBtn) {
        this.dom.submitBtn.disabled = true;
        this.dom.submitBtn.textContent = 'BID ACCEPTED (' + amount + ' T)';
      }

      if (this.dom.userReceiptPanel) {
        this.dom.userReceiptPanel.style.display = 'block';
        if (this.dom.receiptRound) this.dom.receiptRound.textContent = this.currentRound.roundId;
        if (this.dom.receiptAmount) this.dom.receiptAmount.textContent = amount.toLocaleString() + ' Tokens';
        if (this.dom.receiptId) this.dom.receiptId.textContent = receiptId;
      }

      this.updateBidCountUI();
      if (window.showToast) window.showToast('Sealed bid of ' + amount + ' tokens confirmed!', 'success');
      if (this.sound) this.sound.playTick();

      return true;
    }

    resolveAuction() {
      this.gameState = 'LOCKED';
      if (this.dom.timerLabel) this.dom.timerLabel.textContent = 'AUCTION CLOSED - EVALUATING...';
      if (this.dom.submitBtn) this.dom.submitBtn.disabled = true;

      var allBids = [...this.botBids];
      if (this.userBid) {
        allBids.push(this.userBid);
      }

      // If no bids were submitted at all
      if (allBids.length === 0) {
        this.showNoBidsOutcome();
        return;
      }

      // Find highest bid amount
      var maxAmount = 0;
      allBids.forEach(function(b) {
        if (b.amount > maxAmount) maxAmount = b.amount;
      });

      var topBidders = allBids.filter(b => b.amount === maxAmount);

      // Handle Tie Policy
      if (topBidders.length > 1) {
        this.handleTies(topBidders, allBids);
        return;
      }

      // Unique highest bidder
      var winner = topBidders[0];
      var isUserWinner = !winner.isBot;

      if (isUserWinner) {
        var grossCredit = winner.amount * 2;
        var netGain = winner.amount;
        this.store.updateBalance(grossCredit, 'Auction Winner (2x Gross Credit)', this.currentRound.roundId, 'High Bid Arena');
        
        if (this.sound) this.sound.playWin();
        if (window.showToast) window.showToast('Congratulations! You won the auction! +' + netGain + ' Net Tokens', 'success');
      } else {
        if (this.sound) this.sound.playLoss();
        if (this.userBid && window.showToast) {
          window.showToast('Auction finished. Winner: ' + winner.name + ' (' + winner.amount + ' tokens)', 'info');
        }
      }

      this.renderOutcomeList(allBids, winner, null);
      this.scheduleNextRound();
    }

    handleTies(tiedBids, allBids) {
      // Specification: If tied highest bid, refund ALL accepted bids in full.
      if (this.userBid) {
        this.store.updateBalance(this.userBid.amount, 'Tied Highest Bid - Fully Refunded', this.currentRound.roundId, 'High Bid Arena');
      }

      if (this.sound) this.sound.playTick();
      if (window.showToast) {
        window.showToast('Tie detected at ' + tiedBids[0].amount + ' tokens! All bids fully refunded.', 'warning');
      }

      this.renderOutcomeList(allBids, null, tiedBids);
      this.scheduleNextRound();
    }

    showNoBidsOutcome() {
      if (this.dom.resultPanel) {
        this.dom.resultPanel.style.display = 'block';
        if (this.dom.resultBanner) this.dom.resultBanner.className = 'auction-result-banner info';
        if (this.dom.resultTitle) this.dom.resultTitle.textContent = 'No Bids Submitted';
        if (this.dom.resultDetail) this.dom.resultDetail.textContent = 'This round closed with zero bids. No token changes applied.';
      }
      if (this.dom.participantsList) {
        this.dom.participantsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: var(--space-4);">No participants in this auction.</div>';
      }

      this.scheduleNextRound();
    }

    renderOutcomeList(allBids, winner, tiedBids) {
      if (!this.dom.resultPanel) return;

      this.dom.resultPanel.style.display = 'block';

      if (tiedBids) {
        if (this.dom.resultBanner) this.dom.resultBanner.className = 'auction-result-banner warning';
        if (this.dom.resultTitle) this.dom.resultTitle.textContent = 'Auction Result: TIE DETECTED';
        if (this.dom.resultDetail) {
          this.dom.resultDetail.textContent = `Multiple participants tied with ${tiedBids[0].amount} tokens. Per Token Arena rules, all bids have been refunded in full.`;
        }
      } else if (winner) {
        var isUser = !winner.isBot;
        if (this.dom.resultBanner) {
          this.dom.resultBanner.className = 'auction-result-banner ' + (isUser ? 'win' : 'loss');
        }
        if (this.dom.resultTitle) {
          this.dom.resultTitle.textContent = isUser ? 'YOU WON THE AUCTION! 🎉' : `${winner.name} Won the Auction`;
        }
        if (this.dom.resultDetail) {
          var gross = winner.amount * 2;
          this.dom.resultDetail.textContent = isUser ?
            `Your bid of ${winner.amount} tokens was highest! Received ${gross} gross credit (+${winner.amount} net gain).` :
            `Winning bid: ${winner.amount} tokens (${winner.name}). Non-winning bids were charged as lost.`;
        }
      }

      // Sort bids highest to lowest
      allBids.sort((a, b) => b.amount - a.amount);

      if (this.dom.participantsList) {
        this.dom.participantsList.innerHTML = allBids.map(b => {
          var isWin = winner && (winner.playerId === b.playerId);
          var isTie = tiedBids && tiedBids.some(tb => tb.playerId === b.playerId);
          var isUser = !b.isBot;

          var badgeText = isWin ? 'WINNER (2x Credit)' : (isTie ? 'TIED (Refunded)' : (isUser ? 'LOST BID' : 'LOST'));
          var badgeClass = isWin ? 'badge-win' : (isTie ? 'badge-warning' : 'badge-loss');

          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-line); background: ${isUser ? 'var(--bg-raised)' : 'transparent'}; border-radius: var(--radius-sm);">
              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <span style="font-weight: 700; color: ${isUser ? 'var(--electric-cyan)' : 'var(--text-white)'};">${escapeHtml(b.name)}</span>
              </div>
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <span style="font-family: var(--font-heading); font-weight: 800; color: var(--text-white);">${b.amount.toLocaleString()} Tokens</span>
                <span class="${badgeClass}" style="font-size: 0.8rem; font-weight: 700;">${badgeText}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    scheduleNextRound() {
      var self = this;
      this.gameState = 'SETTLED';

      setTimeout(function() {
        self.startNewRound();
      }, 7000);
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.HighBidGame = HighBidGame;
})();
