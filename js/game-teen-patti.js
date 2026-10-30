(function() {
  'use strict';

  class TeenPattiGame {
    constructor() {
      this.store = null;
      this.sound = null;
      this.state = 'LOBBY'; // LOBBY, DEALT, PLAYING, SHOWDOWN, SETTLED
      
      this.entryAmount = 25;
      this.pot = 0;
      this.roundId = null;
      
      this.userCards = [];
      this.userHandEval = null;
      this.seenCards = false;
      this.userFolded = false;
      
      this.botOpponents = [
        { id: 'bot_1', name: 'Asha (Bot)', avatar: 'AS', folded: false, cards: [], handEval: null },
        { id: 'bot_2', name: 'Dev (Bot)', avatar: 'DV', folded: false, cards: [], handEval: null },
        { id: 'bot_3', name: 'Mira (Bot)', avatar: 'MR', folded: false, cards: [], handEval: null }
      ];

      this.deck = [];
    }

    init(store, sound) {
      this.store = store;
      this.sound = sound || window.appSound;

      this.cacheDOM();
      this.bindEvents();
      this.renderLobby();
    }

    cacheDOM() {
      this.dom = {
        potAmount: document.getElementById('tp-pot-amount'),
        opponentsContainer: document.getElementById('tp-opponents-container'),
        userCardsContainer: document.getElementById('tp-user-cards'),
        userStatus: document.getElementById('tp-user-status'),
        userHandName: document.getElementById('tp-user-hand-name'),
        
        // Control views
        lobbyControls: document.getElementById('tp-lobby-controls'),
        actionControls: document.getElementById('tp-action-controls'),
        settledControls: document.getElementById('tp-settled-controls'),

        // Inputs & buttons
        entryInput: document.getElementById('tp-entry-input'),
        joinBtn: document.getElementById('tp-join-btn'),
        seeCardsBtn: document.getElementById('tp-see-cards-btn'),
        continueBtn: document.getElementById('tp-continue-btn'),
        foldBtn: document.getElementById('tp-fold-btn'),
        showdownBtn: document.getElementById('tp-showdown-btn'),
        playAgainBtn: document.getElementById('tp-play-again-btn'),
        
        // Presets
        presetBtns: document.querySelectorAll('#tp-lobby-controls .btn-preset'),
        rulesBtn: document.getElementById('tp-rules-btn')
      };
    }

    bindEvents() {
      var self = this;

      if (this.dom.joinBtn) {
        this.dom.joinBtn.addEventListener('click', function() {
          var val = parseInt(self.dom.entryInput ? self.dom.entryInput.value : 25, 10);
          self.joinTable(val);
        });
      }

      if (this.dom.presetBtns) {
        this.dom.presetBtns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            var val = parseInt(btn.getAttribute('data-preset'), 10);
            if (self.dom.entryInput && !isNaN(val)) {
              self.dom.entryInput.value = val;
            }
          });
        });
      }

      if (this.dom.seeCardsBtn) {
        this.dom.seeCardsBtn.addEventListener('click', function() {
          self.playAction('see');
        });
      }

      if (this.dom.continueBtn) {
        this.dom.continueBtn.addEventListener('click', function() {
          self.playAction('continue');
        });
      }

      if (this.dom.foldBtn) {
        this.dom.foldBtn.addEventListener('click', function() {
          self.playAction('fold');
        });
      }

      if (this.dom.showdownBtn) {
        this.dom.showdownBtn.addEventListener('click', function() {
          self.playAction('showdown');
        });
      }

      if (this.dom.playAgainBtn) {
        this.dom.playAgainBtn.addEventListener('click', function() {
          self.renderLobby();
        });
      }

      if (this.dom.rulesBtn) {
        this.dom.rulesBtn.addEventListener('click', function() {
          if (typeof window.openRulesModal === 'function') {
            window.openRulesModal('teenpatti');
          }
        });
      }
    }

    renderLobby() {
      this.state = 'LOBBY';
      this.pot = 0;
      this.seenCards = false;
      this.userFolded = false;
      this.userCards = [];
      this.userHandEval = null;

      if (this.dom.potAmount) this.dom.potAmount.textContent = '0';
      if (this.dom.userHandName) this.dom.userHandName.textContent = 'Join table to deal cards';
      if (this.dom.userStatus) this.dom.userStatus.textContent = 'Waiting to Join';
      if (this.dom.userCardsContainer) {
        this.dom.userCardsContainer.innerHTML = `
          <div class="playing-card face-down"></div>
          <div class="playing-card face-down"></div>
          <div class="playing-card face-down"></div>
        `;
      }

      // Reset bot seats
      this.botOpponents.forEach(function(b) {
        b.folded = false;
        b.cards = [];
        b.handEval = null;
      });

      this.renderBotSeats(false);

      if (this.dom.lobbyControls) this.dom.lobbyControls.style.display = 'flex';
      if (this.dom.actionControls) this.dom.actionControls.style.display = 'none';
      if (this.dom.settledControls) this.dom.settledControls.style.display = 'none';
    }

    joinTable(entryAmount) {
      if (this.state !== 'LOBBY') return;

      var currentBal = this.store.getBalance();
      var amount = parseInt(entryAmount, 10);

      if (isNaN(amount) || amount <= 0) {
        if (typeof window.showToast === 'function') {
          window.showToast('Please enter a valid positive entry amount.', 'error');
        }
        return;
      }

      if (amount > currentBal) {
        if (typeof window.showToast === 'function') {
          window.showToast('Insufficient token balance for this entry.', 'error');
        }
        return;
      }

      this.entryAmount = amount;
      this.roundId = 'TP-' + Date.now().toString(36).toUpperCase();

      // Reserve user entry
      var res = this.store.updateBalance(-amount, 'Teen Patti Table Entry', this.roundId, 'Three-Card Table');
      if (!res.success) {
        if (typeof window.showToast === 'function') {
          window.showToast(res.reason, 'error');
        }
        return;
      }

      // Pot receives 1x entry from user + 1x entry from each of the 3 virtual opponents
      this.pot = amount * (1 + this.botOpponents.length);
      if (this.dom.potAmount) {
        this.dom.potAmount.textContent = this.pot.toLocaleString();
      }

      this.state = 'DEALT';
      this.seenCards = false;
      this.userFolded = false;

      // Deal cards
      this.deck = window.createDeck ? window.createDeck() : [];
      this.userCards = window.dealCards ? window.dealCards(this.deck, 3) : [];
      this.userHandEval = window.evaluateHand ? window.evaluateHand(this.userCards) : null;

      var self = this;
      this.botOpponents.forEach(function(bot) {
        bot.folded = false;
        bot.cards = window.dealCards ? window.dealCards(self.deck, 3) : [];
        bot.handEval = window.evaluateHand ? window.evaluateHand(bot.cards) : null;
      });

      if (this.sound) this.sound.playTick();

      // UI updates
      if (this.dom.lobbyControls) this.dom.lobbyControls.style.display = 'none';
      if (this.dom.actionControls) this.dom.actionControls.style.display = 'flex';
      if (this.dom.settledControls) this.dom.settledControls.style.display = 'none';

      if (this.dom.seeCardsBtn) {
        this.dom.seeCardsBtn.disabled = false;
        this.dom.seeCardsBtn.style.display = 'inline-flex';
      }
      if (this.dom.continueBtn) this.dom.continueBtn.disabled = false;
      if (this.dom.foldBtn) this.dom.foldBtn.disabled = false;
      if (this.dom.showdownBtn) this.dom.showdownBtn.disabled = true;

      if (this.dom.userStatus) this.dom.userStatus.textContent = 'Blind (Cards Unseen)';
      if (this.dom.userHandName) this.dom.userHandName.textContent = 'Cards dealt. Click "See Cards" or Continue blind!';

      this.renderUserCards(false);
      this.renderBotSeats(false);

      if (typeof window.showToast === 'function') {
        window.showToast('Joined table! ' + amount + ' tokens entered. Pot is ' + this.pot + ' tokens.', 'info');
      }
    }

    playAction(action, payload) {
      if (this.state === 'LOBBY' || this.state === 'SETTLED') return;

      if (action === 'see') {
        this.revealCards();
      } else if (action === 'continue') {
        this.state = 'PLAYING';
        if (this.sound) this.sound.playTick();
        
        // Automated bot decisions (bots with weak high card < 9 rank may fold)
        this.evaluateBotActions();
        
        if (this.dom.showdownBtn) this.dom.showdownBtn.disabled = false;
        if (this.dom.userStatus) {
          this.dom.userStatus.textContent = this.seenCards ? 'Active (Seen)' : 'Active (Blind)';
        }
        if (this.dom.userHandName) {
          this.dom.userHandName.textContent = 'Ready for Showdown! Compare hands with remaining opponents.';
        }
        if (typeof window.showToast === 'function') {
          window.showToast('Round advanced. Click Showdown to reveal hands!', 'info');
        }
      } else if (action === 'fold') {
        this.userFolded = true;
        this.state = 'SETTLED';
        if (this.sound) this.sound.playLoss();

        if (this.dom.userStatus) this.dom.userStatus.textContent = 'Folded';
        if (this.dom.userHandName) this.dom.userHandName.textContent = 'You folded. Entry forfeited.';

        this.renderUserCards(true);
        this.executeShowdown();
      } else if (action === 'showdown') {
        this.executeShowdown();
      }
    }

    revealCards() {
      if (this.seenCards) return;
      this.seenCards = true;
      if (this.sound) this.sound.playTick();

      if (this.dom.seeCardsBtn) {
        this.dom.seeCardsBtn.style.display = 'none';
      }
      if (this.dom.userStatus) {
        this.dom.userStatus.textContent = 'Seen';
      }
      if (this.dom.userHandName && this.userHandEval) {
        this.dom.userHandName.textContent = this.userHandEval.categoryName + ': ' + this.userHandEval.description;
      }

      this.renderUserCards(true);
    }

    evaluateBotActions() {
      var self = this;
      var activeBots = 0;

      this.botOpponents.forEach(function(bot) {
        if (!bot.folded && bot.handEval) {
          // Weak high-card under 9 rank has a 50% fold chance
          if (bot.handEval.category === 1 && bot.handEval.vector[1] < 10 && Math.random() < 0.5) {
            bot.folded = true;
          } else {
            activeBots++;
          }
        }
      });

      this.renderBotSeats(this.state === 'SETTLED' || this.state === 'SHOWDOWN');
    }

    executeShowdown() {
      this.state = 'SHOWDOWN';

      // Reveal all active cards
      this.renderUserCards(true);
      this.renderBotSeats(true);

      if (this.dom.actionControls) this.dom.actionControls.style.display = 'none';
      if (this.dom.settledControls) this.dom.settledControls.style.display = 'flex';

      // Gather non-folded contenders
      var contenders = [];

      if (!this.userFolded && this.userHandEval) {
        contenders.push({
          isUser: true,
          name: 'You',
          handEval: this.userHandEval
        });
      }

      this.botOpponents.forEach(function(bot) {
        if (!bot.folded && bot.handEval) {
          contenders.push({
            isUser: false,
            name: bot.name,
            handEval: bot.handEval
          });
        }
      });

      // Handle user folded or no user left
      if (this.userFolded) {
        if (typeof window.showToast === 'function') {
          window.showToast('You folded. Round lost (-' + this.entryAmount + ' tokens).', 'error');
        }
        this.state = 'SETTLED';
        return;
      }

      // Sort contenders by hand value
      contenders.sort(function(a, b) {
        return window.compareHands(b.handEval, a.handEval);
      });

      var winner = contenders[0];

      // Check for ties at the top
      var winners = contenders.filter(function(c) {
        return window.compareHands(c.handEval, winner.handEval) === 0;
      });

      var userWon = winners.some(function(w) { return w.isUser; });

      if (userWon) {
        var splitPot = Math.floor(this.pot / winners.length);
        var netWin = splitPot - this.entryAmount;

        this.store.updateBalance(splitPot, 'Won Teen Patti Pool (' + this.userHandEval.categoryName + ')', this.roundId, 'Three-Card Table');
        
        if (this.sound) this.sound.playWin();

        if (this.dom.userHandName) {
          this.dom.userHandName.textContent = 'WINNER! ' + this.userHandEval.description + ' (+' + netWin.toLocaleString() + ' tokens net)';
        }

        if (typeof window.showToast === 'function') {
          window.showToast('Congratulations! You won the ' + splitPot.toLocaleString() + ' token pool!', 'success');
        }
      } else {
        if (this.sound) this.sound.playLoss();

        if (this.dom.userHandName) {
          this.dom.userHandName.textContent = 'Round lost to ' + winner.name + ' (' + winner.handEval.categoryName + ')';
        }

        if (typeof window.showToast === 'function') {
          window.showToast(winner.name + ' won with ' + winner.handEval.categoryName + '.', 'error');
        }
      }

      this.state = 'SETTLED';
    }

    renderUserCards(faceUp) {
      if (!this.dom.userCardsContainer) return;

      if (!this.userCards || this.userCards.length === 0) {
        this.dom.userCardsContainer.innerHTML = `
          <div class="playing-card face-down"></div>
          <div class="playing-card face-down"></div>
          <div class="playing-card face-down"></div>
        `;
        return;
      }

      var self = this;
      this.dom.userCardsContainer.innerHTML = this.userCards.map(function(card) {
        return self.createCardHTML(card, !faceUp);
      }).join('');
    }

    renderBotSeats(revealCards) {
      if (!this.dom.opponentsContainer) return;

      var self = this;
      this.dom.opponentsContainer.innerHTML = this.botOpponents.map(function(bot) {
        var statusTag = bot.folded ? 'Folded' : 'Active';
        var tagStyle = bot.folded ? 'color: var(--error-coral);' : 'color: var(--success-light);';

        var cardsHTML = '';
        if (bot.cards && bot.cards.length === 3) {
          cardsHTML = bot.cards.map(function(card) {
            return self.createCardHTML(card, !revealCards || bot.folded);
          }).join('');
        } else {
          cardsHTML = `
            <div class="playing-card face-down" style="width: 38px; height: 56px;"></div>
            <div class="playing-card face-down" style="width: 38px; height: 56px;"></div>
            <div class="playing-card face-down" style="width: 38px; height: 56px;"></div>
          `;
        }

        var handDesc = (revealCards && !bot.folded && bot.handEval) ? bot.handEval.categoryName : '';

        return `
          <div class="player-seat ${!bot.folded ? 'active' : ''}">
            <div class="player-avatar">${bot.avatar}</div>
            <div class="player-name">${bot.name}</div>
            <div class="player-status-tag" style="${tagStyle}">${statusTag}</div>
            <div class="card-hand" style="margin-top: 4px; transform: scale(0.75); transform-origin: top center;">
              ${cardsHTML}
            </div>
            ${handDesc ? `<div style="font-size: 0.7rem; color: var(--electric-cyan); font-weight: 700;">${handDesc}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    createCardHTML(card, faceDown) {
      if (faceDown) {
        return '<div class="playing-card face-down"></div>';
      }
      var colorClass = card.color === 'red' ? 'red' : 'black';
      return `
        <div class="playing-card ${colorClass}">
          <div class="card-top">${card.label}<br>${card.suitSymbol}</div>
          <div class="card-suit-center">${card.suitSymbol}</div>
          <div class="card-bottom">${card.label}<br>${card.suitSymbol}</div>
        </div>
      `;
    }
  }

  window.TeenPattiGame = TeenPattiGame;
})();
