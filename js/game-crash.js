(function() {
  'use strict';

  class CrashGame {
    constructor(store, sound) {
      this.store = store;
      this.sound = sound;

      // State variables
      this.state = 'WAITING'; // WAITING, LIVE, CRASHED
      this.multiplier = 1.00;
      this.crashPoint = 1.00;
      this.currentRoundId = null;

      // Player bet state
      this.currentBet = 0;
      this.hasBet = false;
      this.hasCashedOut = false;
      this.cashedOutMultiplier = 0;
      this.autoCashoutValue = null;

      // History
      this.recentHistory = [];

      // Animation & Timing
      this.animFrameId = null;
      this.startTime = null;
      this.countdownTimer = null;
      this.countdownSeconds = 5;

      // Canvas rendering
      this.canvas = null;
      this.ctx = null;
      this.particles = [];

      // Bound elements
      this.stakeInput = null;
      this.autoInput = null;
      this.actionBtn = null;
      this.multiplierDisplay = null;
      this.statusDisplay = null;
      this.historyBar = null;
    }

    init() {
      this.canvas = document.getElementById('crash-canvas');
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
      }

      this.stakeInput = document.getElementById('crash-stake-input');
      this.autoInput = document.getElementById('crash-auto-input');
      this.actionBtn = document.getElementById('crash-action-btn');
      this.multiplierDisplay = document.getElementById('crash-multiplier-text');
      this.statusDisplay = document.getElementById('crash-status-text');
      this.historyBar = document.getElementById('crash-history-bar');

      this.bindEvents();
      this.resetRound();
    }

    resizeCanvas() {
      if (!this.canvas || !this.canvas.parentElement) return;
      var rect = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.updateCanvas();
    }

    bindEvents() {
      if (this.actionBtn) {
        this.actionBtn.addEventListener('click', () => {
          if (this.state === 'WAITING') {
            if (this.hasBet) {
              this.cancelBet();
            } else {
              var amount = parseInt(this.stakeInput ? this.stakeInput.value : '50', 10);
              this.placeBet(amount);
            }
          } else if (this.state === 'LIVE') {
            if (this.hasBet && !this.hasCashedOut) {
              this.cashOut();
            }
          }
        });
      }

      if (this.autoInput) {
        this.autoInput.addEventListener('input', (e) => {
          var val = parseFloat(e.target.value);
          this.setAutoCashout(isNaN(val) || val <= 1.01 ? null : Math.min(150, val));
        });
      }

      var presetBtns = document.querySelectorAll('#screen-crash [data-preset]');
      presetBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!this.stakeInput) return;
          var preset = btn.getAttribute('data-preset');
          var current = parseInt(this.stakeInput.value || '10', 10);
          var bal = this.store.getBalance();

          if (preset === 'min') this.stakeInput.value = '10';
          else if (preset === 'max') this.stakeInput.value = bal.toString();
          else if (preset === '2x') this.stakeInput.value = Math.min(bal, current * 2).toString();
          else if (preset.startsWith('+')) {
            var add = parseInt(preset.replace('+', ''), 10);
            this.stakeInput.value = Math.min(bal, current + add).toString();
          }
        });
      });
    }

    generateCrashPoint() {
      var rand = Math.random();
      if (rand < 0.03) return 1.00;
      var raw = 0.99 / (1 - rand);
      var pt = Math.max(1.00, Math.floor(raw * 100) / 100);
      return Math.min(150.00, pt);
    }

    resetRound() {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }

      this.state = 'WAITING';
      this.multiplier = 1.00;
      this.currentRoundId = 'RR-' + Math.floor(100000 + Math.random() * 900000);
      this.crashPoint = this.generateCrashPoint();

      this.hasBet = false;
      this.hasCashedOut = false;
      this.currentBet = 0;
      this.cashedOutMultiplier = 0;
      this.particles = [];

      if (this.stakeInput) this.stakeInput.disabled = false;
      this.updateUI();

      this.countdownSeconds = 5;
      this.updateCountdownUI();

      this.countdownTimer = setInterval(() => {
        this.countdownSeconds -= 1;
        if (this.countdownSeconds <= 0) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          this.startRound();
        } else {
          this.updateCountdownUI();
        }
      }, 1000);
    }

    updateCountdownUI() {
      if (this.statusDisplay) {
        this.statusDisplay.textContent = `NEXT FLIGHT IN ${this.countdownSeconds}S...`;
        this.statusDisplay.style.color = 'var(--text-slate)';
      }
      if (this.multiplierDisplay) {
        this.multiplierDisplay.textContent = '1.00x';
        this.multiplierDisplay.className = 'multiplier-value';
      }
      this.updateActionButton();
      this.updateCanvas();
    }

    placeBet(amount) {
      if (this.state !== 'WAITING') {
        if (window.showToast) window.showToast('Round already in progress', 'warning');
        return false;
      }

      if (isNaN(amount) || amount <= 0) {
        if (window.showToast) window.showToast('Enter a valid demo token stake', 'error');
        return false;
      }

      var res = this.store.updateBalance(-amount, `Rocket Run Stake (Round ${this.currentRoundId})`, this.currentRoundId, 'Rocket Run');
      if (!res.success) {
        if (window.showToast) window.showToast(res.reason, 'error');
        return false;
      }

      this.currentBet = amount;
      this.hasBet = true;
      this.hasCashedOut = false;
      if (this.stakeInput) this.stakeInput.disabled = true;

      if (this.sound) this.sound.playTick();
      if (window.showToast) window.showToast(`Placed ${amount} token stake`, 'success');

      this.updateActionButton();
      return true;
    }

    cancelBet() {
      if (this.state !== 'WAITING' || !this.hasBet) return;

      this.store.updateBalance(this.currentBet, `Rocket Run Stake Cancelled`, this.currentRoundId, 'Rocket Run');
      this.hasBet = false;
      this.currentBet = 0;
      if (this.stakeInput) this.stakeInput.disabled = false;

      if (window.showToast) window.showToast('Stake refunded', 'info');
      this.updateActionButton();
    }

    setAutoCashout(target) {
      if (target === null || isNaN(target) || target <= 1.01) {
        this.autoCashoutValue = null;
      } else {
        this.autoCashoutValue = Math.min(150, Math.floor(target * 100) / 100);
      }
    }

    startRound() {
      this.state = 'LIVE';
      this.startTime = performance.now();
      if (this.statusDisplay) {
        this.statusDisplay.textContent = 'JET IN FLIGHT...';
        this.statusDisplay.style.color = 'var(--electric-cyan)';
      }

      this.updateActionButton();
      this.loop();
    }

    loop() {
      if (this.state !== 'LIVE') return;

      var elapsed = (performance.now() - this.startTime) / 1000;
      this.multiplier = Math.floor((Math.exp(0.08 * elapsed)) * 100) / 100;

      if (this.multiplier >= 150.00) {
        this.multiplier = 150.00;
        this.crashPoint = 150.00;
      }

      if (this.hasBet && !this.hasCashedOut && this.autoCashoutValue && this.multiplier >= this.autoCashoutValue) {
        this.cashOut();
      }

      if (this.multiplier >= this.crashPoint) {
        this.multiplier = this.crashPoint;
        this.triggerCrash();
        return;
      }

      if (this.multiplierDisplay) {
        this.multiplierDisplay.textContent = this.multiplier.toFixed(2) + 'x';
      }

      this.updateActionButton();
      this.updateCanvas();

      this.animFrameId = requestAnimationFrame(() => this.loop());
    }

    cashOut() {
      if (this.state !== 'LIVE' || !this.hasBet || this.hasCashedOut) return;

      this.hasCashedOut = true;
      this.cashedOutMultiplier = this.multiplier;

      var grossReturn = Math.floor(this.currentBet * this.cashedOutMultiplier);
      var netProfit = grossReturn - this.currentBet;

      this.store.updateBalance(grossReturn, `Rocket Run Cashout ${this.cashedOutMultiplier.toFixed(2)}x`, this.currentRoundId, 'Rocket Run');

      if (this.sound) this.sound.playWin();
      if (window.showToast) {
        window.showToast(`Cashed out at ${this.cashedOutMultiplier.toFixed(2)}x (+${netProfit} tokens)`, 'success');
      }

      if (this.multiplierDisplay) {
        this.multiplierDisplay.className = 'multiplier-value cashed-out';
      }

      this.updateActionButton();
    }

    triggerCrash() {
      this.state = 'CRASHED';

      if (this.sound) this.sound.playCrash();

      if (this.multiplierDisplay) {
        this.multiplierDisplay.textContent = 'CRASHED @ ' + this.crashPoint.toFixed(2) + 'x';
        this.multiplierDisplay.className = 'multiplier-value crashed';
      }

      if (this.statusDisplay) {
        this.statusDisplay.textContent = 'JET DESTROYED';
        this.statusDisplay.style.color = 'var(--error-coral)';
      }

      if (this.hasBet && !this.hasCashedOut) {
        if (window.showToast) {
          window.showToast(`Lost ${this.currentBet} tokens on crash`, 'error');
        }
      }

      this.recordHistory(this.crashPoint, this.hasCashedOut);
      this.updateActionButton();
      this.updateCanvas();

      setTimeout(() => {
        this.resetRound();
      }, 3500);
    }

    recordHistory(multiplier, won) {
      this.recentHistory.unshift({ multiplier: multiplier, won: won });
      if (this.recentHistory.length > 12) {
        this.recentHistory.pop();
      }

      if (this.historyBar) {
        this.historyBar.innerHTML = this.recentHistory.map((item) => {
          var cls = item.multiplier >= 2.0 ? 'history-pill win' : 'history-pill loss';
          return `<span class="${cls}">${item.multiplier.toFixed(2)}x</span>`;
        }).join('');
      }
    }

    updateActionButton() {
      if (!this.actionBtn) return;

      if (this.state === 'WAITING') {
        if (this.hasBet) {
          this.actionBtn.textContent = 'CANCEL BET (' + this.currentBet + ')';
          this.actionBtn.className = 'btn btn-danger btn-block btn-lg';
          this.actionBtn.disabled = false;
        } else {
          var inputVal = parseInt(this.stakeInput ? this.stakeInput.value : '50', 10) || 50;
          this.actionBtn.textContent = 'PLACE DEMO BET (' + inputVal + ')';
          this.actionBtn.className = 'btn btn-primary btn-block btn-lg';
          this.actionBtn.disabled = false;
        }
      } else if (this.state === 'LIVE') {
        if (this.hasBet && !this.hasCashedOut) {
          var currentReturn = Math.floor(this.currentBet * this.multiplier);
          this.actionBtn.textContent = 'CASH OUT (' + currentReturn + ' TOKENS)';
          this.actionBtn.className = 'btn btn-success btn-block btn-lg';
          this.actionBtn.disabled = false;
        } else if (this.hasCashedOut) {
          this.actionBtn.textContent = 'CASHED OUT (' + Math.floor(this.currentBet * this.cashedOutMultiplier) + ')';
          this.actionBtn.className = 'btn btn-outline btn-block btn-lg';
          this.actionBtn.disabled = true;
        } else {
          this.actionBtn.textContent = 'FLIGHT IN PROGRESS';
          this.actionBtn.className = 'btn btn-outline btn-block btn-lg';
          this.actionBtn.disabled = true;
        }
      } else if (this.state === 'CRASHED') {
        this.actionBtn.textContent = 'ROUND ENDED';
        this.actionBtn.className = 'btn btn-outline btn-block btn-lg';
        this.actionBtn.disabled = true;
      }
    }

    updateUI() {
      this.updateActionButton();
      if (this.multiplierDisplay) {
        this.multiplierDisplay.textContent = '1.00x';
        this.multiplierDisplay.className = 'multiplier-value';
      }
    }

    updateCanvas() {
      if (!this.ctx || !this.canvas) return;

      var width = this.canvas.width;
      var height = this.canvas.height;
      var ctx = this.ctx;

      ctx.clearRect(0, 0, width, height);

      // Background grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      var gridSize = 45;
      for (var x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (var y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      var startX = 60;
      var startY = height - 60;
      
      if (this.state === 'WAITING') {
        // Draw resting rocket on launchpad for high visibility even before takeoff
        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(-Math.PI / 4); // Angled ready for takeoff

        // Rocket body
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.lineTo(10, -8);
        ctx.lineTo(-16, -10);
        ctx.lineTo(-24, 0);
        ctx.lineTo(-16, 10);
        ctx.lineTo(10, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing nose cone & fins
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.lineTo(16, -4);
        ctx.lineTo(16, 4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        return;
      }

      var progress = Math.min(1.0, (this.multiplier - 1) / Math.max(2, this.crashPoint));
      var currentX = startX + (width - 120) * Math.min(progress, 0.90);
      var currentY = startY - (height - 120) * Math.min(progress, 0.85);

      var controlX = startX + (currentX - startX) * 0.5;
      var controlY = startY - 30;

      // Trajectory fill gradient
      var grad = ctx.createLinearGradient(0, 0, 0, height);
      if (this.state === 'CRASHED') {
        grad.addColorStop(0, 'rgba(248, 113, 113, 0.4)');
        grad.addColorStop(1, 'rgba(248, 113, 113, 0.0)');
      } else {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(controlX, controlY, currentX, currentY);
      ctx.lineTo(currentX, startY);
      ctx.closePath();
      ctx.fill();

      // Trajectory curve line
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(controlX, controlY, currentX, currentY);
      ctx.strokeStyle = this.state === 'CRASHED' ? '#f87171' : '#38bdf8';
      ctx.lineWidth = 4;
      ctx.shadowColor = this.state === 'CRASHED' ? '#f87171' : '#38bdf8';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (this.state === 'LIVE') {
        // Calculate tangent angle for rocket/plane tilt
        var nextT = Math.min(1.0, progress + 0.01);
        var nextX = startX + (width - 120) * Math.min(nextT, 0.90);
        var nextY = startY - (height - 120) * Math.min(nextT, 0.85);
        var angle = Math.atan2(nextY - currentY, nextX - currentX);

        // Spawn vibrant afterburner particles
        if (Math.random() < 0.9) {
          this.particles.push({
            x: currentX - Math.cos(angle) * 28,
            y: currentY - Math.sin(angle) * 28,
            vx: -Math.cos(angle) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2,
            vy: -Math.sin(angle) * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2,
            size: 3 + Math.random() * 5,
            alpha: 1.0,
            color: Math.random() > 0.3 ? '#38bdf8' : '#fb923c'
          });
        }

        // Update and render afterburner trail particles
        for (var i = this.particles.length - 1; i >= 0; i--) {
          var p = this.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.035;
          if (p.alpha <= 0) {
            this.particles.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (this.particles.length > 60) {
          this.particles.shift();
        }

        ctx.save();
        ctx.translate(currentX, currentY);
        ctx.rotate(angle);

        // Massive Glowing Afterburner Flame Exhaust
        var flameGrad = ctx.createLinearGradient(-20, 0, -55, 0);
        flameGrad.addColorStop(0, '#ffffff');
        flameGrad.addColorStop(0.3, '#38bdf8');
        flameGrad.addColorStop(0.7, '#fb923c');
        flameGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = flameGrad;
        ctx.shadowColor = '#fb923c';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(-20, -7);
        ctx.lineTo(-55, 0);
        ctx.lineTo(-20, 7);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Detailed Rocket / Supersonic Space Plane Graphic
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;

        // Main Fuselage
        ctx.beginPath();
        ctx.moveTo(34, 0); // Sharp nose cone
        ctx.lineTo(12, -9);
        ctx.lineTo(-18, -12);
        ctx.lineTo(-26, -4);
        ctx.lineTo(-26, 4);
        ctx.lineTo(-18, 12);
        ctx.lineTo(12, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing Cyan Wing Fins
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;

        // Top Wing
        ctx.beginPath();
        ctx.moveTo(6, -6);
        ctx.lineTo(-10, -32);
        ctx.lineTo(-22, -26);
        ctx.lineTo(-14, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bottom Wing
        ctx.beginPath();
        ctx.moveTo(6, 6);
        ctx.lineTo(-10, 32);
        ctx.lineTo(-22, 26);
        ctx.lineTo(-14, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cockpit Window (Bright Cyan Glow)
        var canopyGrad = ctx.createLinearGradient(6, 0, 18, 0);
        canopyGrad.addColorStop(0, '#38bdf8');
        canopyGrad.addColorStop(1, '#ffffff');
        ctx.fillStyle = canopyGrad;
        ctx.beginPath();
        ctx.ellipse(14, 0, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wingtip strobe lights
        ctx.fillStyle = '#fb923c';
        ctx.shadowColor = '#fb923c';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(-20, -28, 2.5, 0, Math.PI * 2);
        ctx.arc(-20, 28, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

      } else if (this.state === 'CRASHED') {
        // Dramatic explosion blast
        ctx.fillStyle = '#f87171';
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 25;
        for (var j = 0; j < 16; j++) {
          var pAngle = (Math.PI * 2 / 16) * j;
          var dist = 16 + ((j % 4) * 10);
          var px = currentX + Math.cos(pAngle) * dist;
          var py = currentY + Math.sin(pAngle) * dist;
          ctx.beginPath();
          ctx.arc(px, py, 5 + (j % 3) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
    }
  }

  window.CrashGame = CrashGame;
})();
