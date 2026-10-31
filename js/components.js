(function() {
  'use strict';

  // Modal close utility
  function setupModalDismiss(modalEl) {
    if (!modalEl) return;
    
    var closeBtns = modalEl.querySelectorAll('[data-dismiss="modal"]');
    closeBtns.forEach(function(btn) {
      btn.onclick = function() {
        modalEl.classList.remove('open');
      };
    });

    modalEl.onclick = function(e) {
      if (e.target === modalEl) {
        modalEl.classList.remove('open');
      }
    };
  }

  // Toast Notification System
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;

    var iconMap = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠'
    };

    toast.innerHTML = `
      <span style="font-weight: 800; font-size: 1.1rem; min-width: 18px;">${iconMap[type] || 'ℹ'}</span>
      <span style="flex: 1;">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 200ms ease-out';
      setTimeout(function() {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    }, 3200);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Header Navigation & Sync
  function initHeaderNav(store) {
    var balanceEl = document.getElementById('header-balance');
    if (balanceEl) {
      balanceEl.textContent = store.getBalance().toLocaleString();
    }

    store.subscribe(function(newBalance) {
      var bEl = document.getElementById('header-balance');
      if (bEl) {
        bEl.textContent = newBalance.toLocaleString();
      }
    });

    // Check returned payment on startup if Payments is loaded
    if (window.Payments && typeof window.Payments.returned === 'function') {
      window.Payments.returned().then(function(res) {
        if (res) {
          handlePaymentResult(res, store);
        }
      }).catch(function(err) {
        console.error('Payment returned check error:', err);
      });
    }

    // Sound toggle
    var soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn && window.appSound) {
      updateSoundIcon(soundBtn, window.appSound.isMuted());
      soundBtn.addEventListener('click', function() {
        var isMuted = window.appSound.toggleMute();
        updateSoundIcon(soundBtn, isMuted);
        showToast(isMuted ? 'Audio muted' : 'Audio enabled', 'info');
      });
    }

    // Download APK button handler
    var downloadApkBtns = document.querySelectorAll('#download-apk-btn, [data-action="download-apk"]');
    downloadApkBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        openDownloadApkModal();
      });
    });

    // Rules nav button
    var rulesNavBtn = document.getElementById('rules-nav-btn');
    if (rulesNavBtn) {
      rulesNavBtn.addEventListener('click', function() {
        openRulesModal('crash');
      });
    }

    // History nav button
    var historyNavBtn = document.getElementById('history-nav-btn');
    if (historyNavBtn) {
      historyNavBtn.addEventListener('click', function() {
        openHistoryModal(store);
      });
    }

    // Referral nav button
    var referralNavBtns = document.querySelectorAll('#referral-nav-btn, #referral-btn');
    referralNavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        openReferralModal(store);
      });
    });

    // Withdraw nav button
    var withdrawNavBtns = document.querySelectorAll('#withdraw-tokens-btn, #withdraw-tokens-nav-btn, #withdraw-nav-btn, #withdrawal-nav-btn');
    withdrawNavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        openWithdrawModal(store);
      });
    });

    // Top Up / Buy Tokens nav button
    var buyNavBtns = document.querySelectorAll('#buy-tokens-btn, #buy-tokens-nav-btn, #topup-nav-btn');
    buyNavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        openTopUpModal(store);
      });
    });

    // Admin Panel initialization check
    if (window.AdminPanel && typeof window.AdminPanel.init === 'function') {
      try {
        window.adminPanelInstance = new window.AdminPanel();
        window.adminPanelInstance.init(store);
      } catch (e) {
        console.error('Failed to init AdminPanel:', e);
      }
    }

    // Mobile nav tab switching
    var navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var targetScreen = tab.getAttribute('data-target');
        if (!targetScreen) return;

        navTabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');

        var screens = document.querySelectorAll('.game-screen');
        screens.forEach(function(screen) {
          if (screen.id === targetScreen) {
            screen.classList.add('active');
          } else {
            screen.classList.remove('active');
          }
        });

        if (window.location.hash !== '#' + targetScreen) {
          window.location.hash = targetScreen;
        }
      });
    });
  }

  function handlePaymentResult(result, store) {
    if (!result) return;
    var status = result.status;
    var ref = result.reference || 'ORD-' + Date.now();
    var amount = parseInt(result.amount || 100, 10);

    if (status === 'PAID' && Number.isFinite(Number(result.amount)) && Number(result.amount) > 0) {
      var tokensToAdd = amount; // Exact 1 token = 1 INR ratio
      store.updateBalance(tokensToAdd, 'Token Purchase (₹' + amount + ')', ref, 'Store');
      showToast('Payment successful! Added ' + tokensToAdd.toLocaleString() + ' tokens instantly.', 'success');
      if (window.appSound) window.appSound.playWin();
    } else if (status === 'PENDING') {
      showToast('Payment is pending confirmation.', 'warning');
    } else if (status === 'CANCELLED') {
      showToast('Payment was cancelled.', 'info');
    } else if (status === 'FAILED') {
      showToast('Payment failed. Please try again.', 'error');
      if (window.appSound) window.appSound.playLoss();
    } else if (status === 'NOT_SET_UP') {
      showToast('Payment gateway not configured. Please add Razorpay keys in server/.env.', 'warning');
    } else {
      showToast(result.message || 'Payment status: ' + status, 'info');
    }
  }

  function openDownloadApkModal() {
    var modal = document.getElementById('download-apk-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'download-apk-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card" style="max-width: 480px;">
          <div class="modal-header">
            <h3 class="modal-title" style="display: flex; align-items: center; gap: var(--space-2);">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--electric-cyan)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download Token Arena APK
            </h3>
            <button class="btn-icon" data-dismiss="modal" aria-label="Close modal">&times;</button>
          </div>
          <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
            <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid var(--electric-cyan); border-radius: var(--radius-md); padding: var(--space-3); font-size: 0.85rem; color: var(--text-slate); line-height: 1.5;">
              <div style="font-weight: 700; color: var(--electric-cyan); margin-bottom: 4px;">Android App Installation:</div>
              • Double-click <code style="color: var(--electric-cyan);">build-apk.bat</code> on your computer to compile the native Android APK package instantly.<br>
              • Alternatively, tap below to install directly as a Progressive Web App (PWA) on your mobile device.
            </div>
            <div style="display: flex; gap: var(--space-3);">
              <button type="button" id="trigger-apk-download-btn" class="btn btn-primary btn-block" style="flex: 1;">
                Download .APK File
              </button>
              <button type="button" id="pwa-install-btn" class="btn btn-outline" style="flex: 1;">
                Add to Home Screen
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      setupModalDismiss(modal);

      var downloadBtn = modal.querySelector('#trigger-apk-download-btn');
      if (downloadBtn) {
        downloadBtn.onclick = function() {
          showToast('Preparing APK package for download...', 'info');
          setTimeout(function() {
            showToast('APK build instruction: Run build-apk.bat in your project folder!', 'success');
          }, 1000);
          modal.classList.remove('open');
        };
      }

      var pwaBtn = modal.querySelector('#pwa-install-btn');
      if (pwaBtn) {
        pwaBtn.onclick = function() {
          showToast('To install: Open browser menu and select "Install App" or "Add to Home Screen".', 'info');
          modal.classList.remove('open');
        };
      }
    }
    setupModalDismiss(modal);
    modal.classList.add('open');
  }

  function updateSoundIcon(btn, isMuted) {
    btn.innerHTML = isMuted ? 
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>' :
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 1 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  }

  // Daily Refill / Claim Feature
  function initDailyClaim(store) {
    var claimBtn = document.getElementById('claim-nav-btn');
    if (claimBtn) {
      claimBtn.addEventListener('click', function() {
        var current = store.getBalance();
        if (current >= 1000) {
          showToast('Balance already sufficient (' + current.toLocaleString() + ' tokens). Refill available when low!', 'info');
          return;
        }
        store.resetBalance(1000);
        showToast('Demo tokens refilled to 1,000!', 'success');
        if (window.appSound) window.appSound.playWin();
      });
    }
  }

  // Referral Modal & System
  function initReferralSystem(store) {
    var referralBtns = document.querySelectorAll('#referral-nav-btn, #referral-btn');
    referralBtns.forEach(function(btn) {
      btn.onclick = function() {
        openReferralModal(store);
      };
    });
  }

  function openReferralModal(store) {
    var auth = window.Super100Auth;
    if (!auth || !auth.getUser || !auth.getUser()) {
      if (auth && auth.openGate) auth.openGate();
      showToast('Please sign in to view and share your referral link.', 'info');
      return;
    }
    var modal = document.getElementById('referral-modal');
    if (!modal) {
      showToast('Referral panel is unavailable. Please refresh the page.', 'error');
      return;
    }
    ['referral-phone-form', 'referral-apply-form'].forEach(function(id) {
      var legacyForm = modal.querySelector('#' + id);
      if (legacyForm) legacyForm.style.display = 'none';
    });
    var oldId = modal.querySelector('#referral-my-id');
    var profile = auth.getProfile && auth.getProfile();
    if (oldId) oldId.textContent = profile && profile.referralCode ? profile.referralCode : 'Loading…';
    var intro = modal.querySelector('.modal-body > div:first-child');
    if (intro) intro.innerHTML = '<div style="font-weight:800;color:var(--electric-cyan);margin-bottom:6px;">Invite friends with your personal link</div><div style="font-size:.84rem;color:var(--text-slate);line-height:1.5;">Share your Super100 invitation link. When a new person signs in, chooses “Yes, I was referred” and confirms your registered mobile number, you receive 200 tokens and they receive 100 tokens.</div>';
    var count = modal.querySelector('#referral-stat-count');
    var earned = modal.querySelector('#referral-stat-earned');
    if (count && profile) count.textContent = String(Number(profile.referralCount || 0));
    if (earned && profile) earned.textContent = Number(profile.referralRewardTotal || 0).toLocaleString() + ' Tokens';
    setupModalDismiss(modal);
    modal.classList.add('open');
  }

  function getPlayerReferralId() {
    var refId = '';
    try {
      refId = localStorage.getItem('token_arena_my_referral_id') || '';
      if (!refId || refId.length !== 10) {
        refId = '9876543210';
        localStorage.setItem('token_arena_my_referral_id', refId);
      }
    } catch(e) {
      refId = '9876543210';
    }
    return refId;
  }

  function renderReferralModal(store) {
    var modal = document.createElement('div');
    modal.id = 'referral-modal';
    modal.className = 'modal-backdrop';

    var myRefId = getPlayerReferralId();
    var hasClaimedRef = false;
    try {
      hasClaimedRef = localStorage.getItem('token_arena_has_claimed_ref') === 'true';
    } catch(e){}

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 520px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: var(--space-2);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--electric-cyan)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Referral Program (Earn 200 Tokens)
          </h3>
          <button class="btn-icon" data-dismiss="modal" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid var(--electric-cyan); border-radius: var(--radius-md); padding: var(--space-3); font-size: 0.82rem; color: var(--text-slate); line-height: 1.5;">
            <div style="font-weight: 700; color: var(--electric-cyan); margin-bottom: 4px;">How Referral Works:</div>
            • Your 10-digit mobile number serves as your <strong style="color: var(--text-white);">Unique Referral ID</strong>.<br>
            • Share your ID with friends. When they enter your referral ID, <strong style="color: var(--success-light);">you receive 200 tokens</strong> instantly!<br>
            • New players can also enter a referral code below to claim bonus starter tokens.
          </div>

          <!-- My Referral ID Card -->
          <div style="background: var(--bg-surface); border: 1px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2);">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">Your Unique Referral ID / Mobile No:</div>
            <div style="display: flex; gap: var(--space-2); align-items: center;">
              <input type="text" id="my-referral-id-display" class="input-control" value="${myRefId}" maxlength="10" style="font-weight: 700; color: var(--electric-cyan); font-family: monospace;" />
              <button type="button" id="save-referral-id-btn" class="btn btn-outline" style="padding: 10px 14px; font-size: 0.8rem;">Update</button>
              <button type="button" id="copy-referral-btn" class="btn btn-primary" style="padding: 10px 16px; font-size: 0.8rem;">Copy Link</button>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Share link: <code id="referral-link-preview" style="color: var(--electric-cyan);">index.html?ref=${myRefId}</code></div>
          </div>

          <!-- Enter Referral Code Section -->
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px dashed var(--border-line); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-3);">
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-white);">
              Have a Friend's Referral Code?
            </div>
            <form id="enter-referral-form" onsubmit="return false;" style="display: flex; flex-direction: column; gap: var(--space-2);">
              <div class="form-group" style="margin-bottom: 0;">
                <input type="tel" id="enter-referral-input" class="input-control" placeholder="Enter 10-digit mobile ref ID" maxlength="10" ${hasClaimedRef ? 'disabled' : ''} />
              </div>
              <div id="referral-error-msg" style="display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: var(--error-coral); padding: var(--space-2); border-radius: var(--radius-md); font-size: 0.8rem;"></div>
              
              <button type="submit" id="claim-referral-btn" class="btn btn-success btn-block" ${hasClaimedRef ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                ${hasClaimedRef ? 'Referral Bonus Already Claimed ✓' : 'Claim 200 Token Bonus'}
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    var saveBtn = modal.querySelector('#save-referral-id-btn');
    var inputDisplay = modal.querySelector('#my-referral-id-display');
    var linkPreview = modal.querySelector('#referral-link-preview');
    var copyBtn = modal.querySelector('#copy-referral-btn');
    var claimForm = modal.querySelector('#enter-referral-form');
    var claimInput = modal.querySelector('#enter-referral-input');
    var errorMsg = modal.querySelector('#referral-error-msg');

    if (saveBtn && inputDisplay) {
      saveBtn.onclick = function() {
        var newId = inputDisplay.value.trim().replace(/\D/g, '');
        if (newId.length !== 10) {
          showToast('Referral mobile number must be exactly 10 digits', 'warning');
          return;
        }
        try {
          localStorage.setItem('token_arena_my_referral_id', newId);
          if (linkPreview) linkPreview.textContent = 'index.html?ref=' + newId;
          showToast('Referral ID updated successfully!', 'success');
        } catch(e) {
          showToast('Failed to save referral ID', 'error');
        }
      };
    }

    if (copyBtn && inputDisplay) {
      copyBtn.onclick = function() {
        var textToCopy = window.location.origin + window.location.pathname + '?ref=' + inputDisplay.value.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(function() {
            showToast('Referral link copied to clipboard!', 'success');
          }).catch(function() {
            fallbackCopy(textToCopy);
          });
        } else {
          fallbackCopy(textToCopy);
        }
      };
    }

    function fallbackCopy(text) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Referral link copied!', 'success');
      } catch(e) {
        showToast('Could not copy link automatically', 'error');
      }
      document.body.removeChild(textarea);
    }

    if (claimForm) {
      claimForm.onsubmit = function(e) {
        e.preventDefault();
        showToast('Referral rewards are available only through an eligible Super100 referral link after sign-in.', 'warning');
        return false;
      };
    }

    return modal;
  }

  function updateReferralModalState(modal, store) {
    var myRefId = getPlayerReferralId();
    var inputDisplay = modal.querySelector('#my-referral-id-display');
    var linkPreview = modal.querySelector('#referral-link-preview');
    if (inputDisplay) inputDisplay.value = myRefId;
    if (linkPreview) linkPreview.textContent = 'index.html?ref=' + myRefId;
  }

  function checkUrlReferralParam(store) {
    // Referral URLs are captured by js/auth.js and redeemed by the authenticated
    // Firebase/Firestore server transaction. Never award tokens in browser storage.
    return;
  }

  // Withdraw Modal Feature
  function initWithdrawModal(store) {
    var withdrawBtns = document.querySelectorAll('#withdraw-tokens-btn, #withdraw-tokens-nav-btn, #withdraw-nav-btn, #withdrawal-nav-btn');
    withdrawBtns.forEach(function(btn) {
      btn.onclick = function() {
        openWithdrawModal(store);
      };
    });
  }

  function openWithdrawModal(store) {
    var modal = document.getElementById('withdrawal-modal');
    if (!modal) {
      modal = renderWithdrawModal(store);
      document.body.appendChild(modal);
    }
    setupModalDismiss(modal);
    modal.classList.add('open');
  }

  function renderWithdrawModal(store) {
    var modal = document.getElementById('withdrawal-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'withdrawal-modal';
      modal.className = 'modal-backdrop';
    }

    var currentBalance = store.getBalance();

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 500px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: var(--space-2);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--electric-cyan)" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Withdraw Tokens to UPI
          </h3>
          <button class="btn-icon" data-dismiss="modal" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
          <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid var(--electric-cyan); border-radius: var(--radius-md); padding: var(--space-3); font-size: 0.82rem; color: var(--text-slate); line-height: 1.5;">
            <div style="font-weight: 700; color: var(--electric-cyan); margin-bottom: 4px;">Withdrawal Rules:</div>
            • Minimum withdrawal amount is <strong style="color: var(--text-white);">2,000 tokens (₹2,000)</strong>.<br>
            • Bonus/promo amounts cannot be withdrawn.<br>
            • Funds will be transferred directly to your verified UPI ID (1 token = ₹1).
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: var(--space-3); border-radius: var(--radius-md);">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Available Balance:</span>
            <span id="withdraw-modal-balance" style="font-size: 1.1rem; font-weight: 800; color: var(--electric-cyan);">${currentBalance.toLocaleString()} Tokens</span>
          </div>

          <form id="withdrawal-form" style="display: flex; flex-direction: column; gap: var(--space-3);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Your UPI ID (e.g. username@okhdfcbank)</label>
              <input type="text" id="withdrawal-upi-input" class="input-control" placeholder="e.g. rahul@upi" required />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Withdrawal Amount (Tokens = ₹ INR)</label>
              <input type="number" id="withdrawal-amount-input" class="input-control" placeholder="Min 2000" min="2000" required />
            </div>

            <div id="withdraw-error-msg" style="display: none; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: var(--error-coral); padding: var(--space-2); border-radius: var(--radius-md); font-size: 0.8rem;"></div>

            <button type="submit" id="withdrawal-submit-btn" class="btn btn-primary btn-block btn-lg" style="margin-top: var(--space-2);">
              Request Withdrawal
            </button>
          </form>
        </div>
      </div>
    `;

    var form = modal.querySelector('#withdrawal-form');
    var upiInput = modal.querySelector('#withdrawal-upi-input');
    var amountInput = modal.querySelector('#withdrawal-amount-input');
    var errorMsg = modal.querySelector('#withdraw-error-msg');

    form.onsubmit = function(e) {
      e.preventDefault();
      var upiId = (upiInput ? upiInput.value : '').trim();
      var amount = parseInt(amountInput ? amountInput.value : '0', 10);

      if (errorMsg) {
        errorMsg.style.display = 'none';
      }

      if (!upiId || upiId.indexOf('@') === -1) {
        if (errorMsg) {
          errorMsg.textContent = 'Please enter a valid UPI ID (containing @).';
          errorMsg.style.display = 'block';
        }
        showToast('Please enter a valid UPI ID', 'warning');
        return;
      }

      if (isNaN(amount) || amount < 2000) {
        if (errorMsg) {
          errorMsg.textContent = 'Minimum withdrawal amount is 2,000 tokens.';
          errorMsg.style.display = 'block';
        }
        showToast('Minimum amount to withdraw is 2,000 tokens', 'warning');
        return;
      }

      var currentBal = store.getBalance();
      if (amount > currentBal) {
        if (errorMsg) {
          errorMsg.textContent = 'Insufficient balance for this withdrawal.';
          errorMsg.style.display = 'block';
        }
        showToast('Insufficient balance', 'error');
        return;
      }

      var success = store.withdrawTokens(amount, upiId);
      if (success) {
        showToast('Withdrawal request of ' + amount.toLocaleString() + ' tokens (₹' + amount + ') to ' + upiId + ' submitted successfully!', 'success');
        if (window.appSound) window.appSound.playWin();
        modal.classList.remove('open');
        if (upiInput) upiInput.value = '';
        if (amountInput) amountInput.value = '';
        
        if (window.adminPanelInstance && typeof window.adminPanelInstance.render === 'function') {
          window.adminPanelInstance.render();
        }
      } else {
        if (errorMsg) {
          errorMsg.textContent = 'Withdrawal failed. Check balance or bonus amount restrictions.';
          errorMsg.style.display = 'block';
        }
        showToast('Withdrawal failed. Bonus amounts cannot be withdrawn.', 'error');
        if (window.appSound) window.appSound.playLoss();
      }
    };

    return modal;
  }

  // Top Up / Token Purchase Modal with Real Razorpay Payment Integration (1 Token = 1 INR)
  function initTopUpModal(store) {
    checkUrlReferralParam(store);

    var topUpBtns = document.querySelectorAll('#buy-tokens-btn, #buy-tokens-nav-btn, #topup-nav-btn');
    topUpBtns.forEach(function(btn) {
      btn.onclick = function() {
        openTopUpModal(store);
      };
    });
  }

  function openTopUpModal(store) {
    var modal = document.getElementById('topup-modal');
    if (!modal) {
      modal = createTopUpModalDOM(store);
      document.body.appendChild(modal);
    }

    setupModalDismiss(modal);
    modal.classList.add('open');
  }

  function createTopUpModalDOM(store) {
    var modal = document.createElement('div');
    modal.id = 'topup-modal';
    modal.className = 'modal-backdrop';

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 580px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: var(--space-2);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--electric-cyan)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/></svg>
            Pay Real Money Via UPI, Card, Net Banking (1 Token = ₹1)
          </h3>
          <button class="btn-icon" data-dismiss="modal" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
          
          <!-- Token Packages Box -->
          <div style="background: rgba(56, 189, 248, 0.09); border: 1.5px solid var(--electric-cyan); border-radius: var(--radius-md); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3);">
            <div>
              <div style="font-weight: 800; color: var(--electric-cyan); font-size: 1rem; display: flex; align-items: center; gap: 6px;">
                <span>⚡ Select or Enter Amount (1 Token = ₹1 Real Money)</span>
              </div>
              <div style="font-size: 0.82rem; color: var(--text-slate); margin-top: 4px; line-height: 1.5;">
                Choose a package or enter your custom real money amount to add via UPI QR, Card, Net Banking, or Wallet. Tokens are credited 1:1 instantly upon successful payment.
              </div>
            </div>

            <div class="package-selection" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3);">
              <button type="button" class="pkg-card active" data-amount="100" style="background: var(--bg-surface); border: 2px solid var(--electric-cyan); border-radius: var(--radius-md); padding: var(--space-3); text-align: center; cursor: pointer; color: var(--text-white); transition: all 0.2s;">
                <div style="font-size: 0.8rem; color: var(--text-muted);">Starter Pack</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--electric-cyan); margin: var(--space-1) 0;">100 Tokens</div>
                <div style="font-size: 0.75rem; color: var(--success-light); font-weight: 700;">₹100</div>
              </button>
              <button type="button" class="pkg-card" data-amount="500" style="background: var(--bg-surface); border: 2px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-3); text-align: center; cursor: pointer; color: var(--text-white); transition: all 0.2s;">
                <div style="font-size: 0.8rem; color: var(--success-light); font-weight: 700;">Popular</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--electric-cyan); margin: var(--space-1) 0;">500 Tokens</div>
                <div style="font-size: 0.75rem; color: var(--success-light); font-weight: 700;">₹500</div>
              </button>
              <button type="button" class="pkg-card" data-amount="1000" style="background: var(--bg-surface); border: 2px solid var(--border-line); border-radius: var(--radius-md); padding: var(--space-3); text-align: center; cursor: pointer; color: var(--text-white); transition: all 0.2s;">
                <div style="font-size: 0.8rem; color: var(--warning-amber); font-weight: 700;">PRO CHOICE</div>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--electric-cyan); margin: var(--space-1) 0;">1,000 Tokens</div>
                <div style="font-size: 0.75rem; color: var(--success-light); font-weight: 700;">₹1,000</div>
              </button>
            </div>

            <!-- Custom Amount Input Field -->
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 0.78rem;">Or Enter Custom Amount (₹ INR = Tokens)</label>
              <div style="display: flex; gap: var(--space-2); align-items: center;">
                <input type="number" id="custom-rupees-input" class="input-control" placeholder="Enter custom amount in ₹" min="1" max="100000" value="100" style="font-weight: 700; color: var(--electric-cyan);" />
                <span id="custom-tokens-preview" style="font-size: 0.85rem; color: var(--success-light); white-space: nowrap; font-weight: 700;">= 100 Tokens</span>
              </div>
            </div>

            <!-- Customer Details for Payment -->
            <div style="display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-1);">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.78rem;">Your Name</label>
                <input type="text" id="topup-name-input" class="input-control" placeholder="e.g. Rahul Sharma" value="Player" />
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2);">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.78rem;">Mobile Number (10 digits)</label>
                  <input type="tel" id="topup-phone-input" class="input-control" placeholder="9876543210" maxlength="10" value="9876543210" />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.78rem;">Email Address</label>
                  <input type="email" id="topup-email-input" class="input-control" placeholder="player@example.com" value="player@tokenarena.in" />
                </div>
              </div>
            </div>

            <div style="display: flex; gap: var(--space-2); margin-top: var(--space-2);">
              <button type="button" id="pay-topup-btn" class="btn btn-primary btn-block" style="padding: 14px; font-size: 0.95rem; font-weight: 700;">
                Pay ₹100 (Razorpay / Gateway)
              </button>
            </div>

            <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 4px;">
              Payments secured by Razorpay. UPI, cards, net banking and wallets.
            </div>
          </div>
        </div>
      </div>
    `;

    var pkgBtns = modal.querySelectorAll('.pkg-card');
    var payBtn = modal.querySelector('#pay-topup-btn');
    var nameInput = modal.querySelector('#topup-name-input');
    var phoneInput = modal.querySelector('#topup-phone-input');
    var emailInput = modal.querySelector('#topup-email-input');
    var customInput = modal.querySelector('#custom-rupees-input');
    var tokensPreview = modal.querySelector('#custom-tokens-preview');

    var selectedAmount = 100;

    pkgBtns.forEach(function(btn) {
      btn.onclick = function() {
        pkgBtns.forEach(function(b) {
          b.classList.remove('active');
          b.style.borderColor = 'var(--border-line)';
        });
        btn.classList.add('active');
        btn.style.borderColor = 'var(--electric-cyan)';

        selectedAmount = parseInt(btn.getAttribute('data-amount'), 10);

        if (customInput) customInput.value = selectedAmount;
        if (tokensPreview) tokensPreview.textContent = '= ' + selectedAmount.toLocaleString() + ' Tokens';

        if (payBtn) {
          payBtn.textContent = 'Pay ₹' + selectedAmount.toLocaleString() + ' (Razorpay / Gateway)';
        }
      };
    });

    if (customInput) {
      customInput.oninput = function() {
        var val = parseInt(customInput.value, 10);
        if (isNaN(val) || val <= 0) val = 0;
        selectedAmount = val;

        pkgBtns.forEach(function(b) {
          b.classList.remove('active');
          b.style.borderColor = 'var(--border-line)';
        });

        if (tokensPreview) tokensPreview.textContent = '= ' + selectedAmount.toLocaleString() + ' Tokens';
        if (payBtn) {
          payBtn.textContent = 'Pay ₹' + selectedAmount.toLocaleString() + ' (Razorpay / Gateway)';
        }
      };
    }

    if (payBtn) {
      payBtn.onclick = function() {
        var name = (nameInput ? nameInput.value : '').trim() || 'Player';
        var phone = (phoneInput ? phoneInput.value : '').trim().replace(/\D/g, '');
        var email = (emailInput ? emailInput.value : '').trim() || 'player@tokenarena.in';

        if (selectedAmount <= 0) {
          showToast('Please enter a valid amount to add', 'warning');
          return;
        }

        if (phone.length !== 10) {
          showToast('Please enter a valid 10-digit mobile number', 'warning');
          return;
        }

        // Open Payment Method Selection Modal before launching gateway
        openPaymentOptionsModal(selectedAmount, name, email, phone, store, modal);
      };
    }

    return modal;
  }

  function openPaymentOptionsModal(amount, name, email, phone, store, parentModal) {
    var existingOpts = document.getElementById('payment-options-modal');
    if (existingOpts) existingOpts.remove();

    var optModal = document.createElement('div');
    optModal.id = 'payment-options-modal';
    optModal.className = 'modal-backdrop';
    optModal.style.zIndex = '10000';

    optModal.innerHTML = `
      <div class="modal-card" style="max-width: 440px; text-align: center;">
        <div class="modal-header">
          <h3 class="modal-title" style="font-size: 1.1rem; color: var(--text-white);">Select Payment Method</h3>
          <button class="btn-icon" data-dismiss="modal" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
          <div style="background: var(--bg-surface); padding: var(--space-3); border-radius: var(--radius-md);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Amount to Pay</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--electric-cyan);">₹${amount.toLocaleString()}</div>
            <div style="font-size: 0.78rem; color: var(--success-light); margin-top: 2px;">Will receive ${amount.toLocaleString()} Tokens</div>
          </div>

          <div style="display: flex; flex-direction: column; gap: var(--space-3);">
            <button type="button" id="pay-upi-qr-btn" class="btn btn-primary btn-block btn-lg" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M3 14h7v7H3z"/></svg>
              UPI / QR Code Scan to Pay
            </button>
            <button type="button" id="pay-card-net-btn" class="btn btn-outline btn-lg" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              Card / Net Banking / Wallet
            </button>
            <button type="button" id="pay-cancel-btn" class="btn btn-ghost" style="color: var(--text-muted);">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(optModal);
    setupModalDismiss(optModal);
    optModal.classList.add('open');

    var upiQrBtn = optModal.querySelector('#pay-upi-qr-btn');
    var cardNetBtn = optModal.querySelector('#pay-card-net-btn');
    var cancelBtn = optModal.querySelector('#pay-cancel-btn');

    if (cancelBtn) {
      cancelBtn.onclick = function() {
        optModal.classList.remove('open');
      };
    }

    if (upiQrBtn) {
      upiQrBtn.onclick = function() {
        optModal.classList.remove('open');
        showUpiQrCodeModal(amount, name, email, phone, store, parentModal);
      };
    }

    if (cardNetBtn) {
      cardNetBtn.onclick = function() {
        optModal.classList.remove('open');
        executeGatewayPayment(amount, name, email, phone, store, parentModal);
      };
    }
  }

  function showUpiQrCodeModal(amount, name, email, phone, store, parentModal) {
    var existing = document.getElementById('upi-qr-modal');
    if (existing) existing.remove();

    var qrModal = document.createElement('div');
    qrModal.id = 'upi-qr-modal';
    qrModal.className = 'modal-backdrop';
    qrModal.style.zIndex = '10005';
    var orderRef = 'TOKEN-' + amount + '-' + Date.now();
    var cancelled = false;
    var pollTimer = null;

    qrModal.innerHTML = `
      <div class="modal-card" style="max-width: 440px; text-align: center;">
        <div class="modal-header">
          <h3 class="modal-title" style="font-size: 1.1rem; color: var(--text-white);">Scan Razorpay UPI QR Code</h3>
          <button class="btn-icon" id="close-upi-qr-modal" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-3); align-items: center;">
          <div style="font-size: 0.9rem; color: var(--text-slate);">
            Scan this QR code with any UPI app to pay <strong style="color: var(--electric-cyan);">₹${Number(amount).toLocaleString()}</strong>.
          </div>
          <div id="upi-qr-image-wrap" style="background:#fff;padding:14px;border-radius:12px;min-height:240px;min-width:240px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.3);">
            <div id="upi-qr-loading" style="color:#111827;font-size:13px;">Generating secure QR code…</div>
          </div>
          <div id="upi-qr-status" role="status" aria-live="polite" style="font-size:.85rem;color:var(--text-muted);">Waiting for Razorpay QR generation.</div>
          <button type="button" id="cancel-upi-modal-btn" class="btn btn-ghost" style="color:var(--text-muted);width:100%;">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(qrModal);
    setupModalDismiss(qrModal);
    qrModal.classList.add('open');

    var statusEl = qrModal.querySelector('#upi-qr-status');
    var imageWrap = qrModal.querySelector('#upi-qr-image-wrap');

    function closeModal() {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      qrModal.classList.remove('open');
    }
    qrModal.querySelector('#close-upi-qr-modal').onclick = closeModal;
    qrModal.querySelector('#cancel-upi-modal-btn').onclick = closeModal;

    if (!window.Payments || typeof window.Payments.createUpiQr !== 'function' || typeof window.Payments.checkUpiQr !== 'function') {
      statusEl.textContent = 'Secure UPI QR payments are unavailable. No tokens were added.';
      return;
    }

    window.Payments.createUpiQr(amount, orderRef).then(function(qr) {
      if (cancelled) return;
      var img = document.createElement('img');
      img.src = qr.imageUrl;
      img.alt = 'Razorpay UPI payment QR code';
      img.style.cssText = 'width:260px;max-width:100%;height:auto;display:block;object-fit:contain;';
      imageWrap.innerHTML = '';
      imageWrap.appendChild(img);
      statusEl.textContent = 'Waiting for payment confirmation from Razorpay…';

      var startedAt = Date.now();
      function poll() {
        if (cancelled) return;
        window.Payments.checkUpiQr(qr.qrId).then(function(result) {
          if (cancelled) return;
          if (result && result.status === 'PAID' && Number(result.amount) === Number(amount)) {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
            qrModal.classList.remove('open');
            if (parentModal) parentModal.classList.remove('open');
            // Return to the main game screen after verified payment.
            if (window.location && window.location.hash !== '#screen-crash') {
              window.location.hash = '#screen-crash';
            }
            handlePaymentResult({
              status: 'PAID',
              amount: Number(result.amount),
              reference: orderRef,
              message: 'Razorpay confirmed the captured UPI payment.'
            }, store);
            return;
          }
          if (Date.now() - startedAt >= 25 * 60 * 1000) {
            statusEl.textContent = 'Payment not confirmed yet. No tokens have been added. Close this window and contact support if you paid.';
            return;
          }
          if (Number(result && result.receivedAmount) > 0) {
            statusEl.textContent = 'Razorpay has received ₹' + Number(result.receivedAmount).toFixed(2) + '. Waiting for final captured-payment confirmation…';
          } else {
            statusEl.textContent = 'Payment not received yet. Waiting for Razorpay confirmation…';
          }
          pollTimer = setTimeout(poll, 2500);
        }).catch(function() {
          if (cancelled) return;
          if (Date.now() - startedAt >= 25 * 60 * 1000) {
            statusEl.textContent = 'Could not confirm payment. No tokens have been added.';
            return;
          }
          statusEl.textContent = 'Checking payment securely with Razorpay…';
          pollTimer = setTimeout(poll, 3500);
        });
      }
      poll();
    }).catch(function(err) {
      if (cancelled) return;
      statusEl.textContent = (err && err.message ? err.message : 'Could not create Razorpay QR.') + ' No tokens have been added.';
      imageWrap.innerHTML = '<div style="color:#991b1b;padding:12px;font-size:13px;">QR generation failed</div>';
    });
  }

  function executeGatewayPayment(amount, name, email, phone, store, parentModal) {
    var orderRef = 'TOKEN-' + amount + '-' + Date.now();
    var note = 'Purchase ' + amount.toLocaleString() + ' Tokens (₹' + amount + ' Real Money)';

    if (window.Payments && typeof window.Payments.start === 'function') {
      window.Payments.start({
        amount: amount,
        name: name,
        email: email,
        phone: phone,
        note: note,
        reference: orderRef
      }).then(function(result) {
        if (result) {
          handlePaymentResult(result, store);
          if (result.status === 'PAID') {
            if (parentModal) parentModal.classList.remove('open');
          }
        }
      }).catch(function(err) {
        showToast('Payment gateway error. Please try again.', 'error');
      });
    } else {
      showToast('Payment system not initialized.', 'error');
    }
  }

  function openTopUpModalWrapper(store) {
    openTopUpModal(store);
  }

  // Rules Modal
  function openRulesModal(gameType) {
    var modal = document.getElementById('rules-modal');
    if (!modal) return;

    setupModalDismiss(modal);

    var tabCrash = document.getElementById('rule-tab-crash');
    var tabTeen = document.getElementById('rule-tab-teenpatti');
    var tabBid = document.getElementById('rule-tab-highbid');

    var contentCrash = document.getElementById('rule-content-crash');
    var contentTeen = document.getElementById('rule-content-teenpatti');
    var contentBid = document.getElementById('rule-content-highbid');

    function setActiveTab(selected) {
      [tabCrash, tabTeen, tabBid].forEach(function(t) {
        if (t) t.classList.remove('active');
      });
      [contentCrash, contentTeen, contentBid].forEach(function(c) {
        if (c) c.style.display = 'none';
      });

      if (selected === 'teenpatti' && tabTeen && contentTeen) {
        tabTeen.classList.add('active');
        contentTeen.style.display = 'block';
      } else if (selected === 'highbid' && tabBid && contentBid) {
        tabBid.classList.add('active');
        contentBid.style.display = 'block';
      } else if (tabCrash && contentCrash) {
        tabCrash.classList.add('active');
        contentCrash.style.display = 'block';
      }
    }

    if (tabCrash) tabCrash.onclick = function() { setActiveTab('crash'); };
    if (tabTeen) tabTeen.onclick = function() { setActiveTab('teenpatti'); };
    if (tabBid) tabBid.onclick = function() { setActiveTab('highbid'); };

    setActiveTab(gameType || 'crash');
    modal.classList.add('open');
  }

  // Ledger / Transaction History Modal
  function openHistoryModal(store) {
    var modal = document.getElementById('history-modal');
    if (!modal) return;

    setupModalDismiss(modal);

    var tableBody = document.getElementById('history-table-body');
    var filterSelect = document.getElementById('history-filter-game');

    function renderHistory() {
      var history = store.getHistory();
      var filter = filterSelect ? filterSelect.value : 'all';

      var filtered = history.filter(function(item) {
        if (filter === 'all') return true;
        return item.gameType.toLowerCase().replace(/\s+/g, '') === filter.toLowerCase().replace(/\s+/g, '');
      });

      if (!tableBody) return;

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: var(--space-8);">
              No transaction history recorded yet. Start playing to build your log!
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = filtered.map(function(entry) {
        var isWin = entry.delta > 0;
        var badgeClass = isWin ? 'badge-win' : (entry.delta < 0 ? 'badge-loss' : '');
        var deltaStr = (entry.delta > 0 ? '+' : '') + entry.delta.toLocaleString();

        return `
          <tr>
            <td><span style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">${entry.roundId || entry.id}</span></td>
            <td><strong>${escapeHtml(entry.gameType)}</strong></td>
            <td>${escapeHtml(entry.reason)}</td>
            <td class="${badgeClass}">${deltaStr}</td>
            <td style="font-weight: 700;">${entry.balanceAfter.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    }

    if (filterSelect) {
      filterSelect.onchange = renderHistory;
    }

    renderHistory();
    modal.classList.add('open');
  }

  // Export functions to global scope
  window.initHeaderNav = initHeaderNav;
  window.openRulesModal = openRulesModal;
  window.openHistoryModal = openHistoryModal;
  window.showToast = showToast;
  window.initDailyClaim = initDailyClaim;
  window.initReferralSystem = initReferralSystem;
  window.openReferralModal = openReferralModal;
  window.initTopUpModal = initTopUpModal;
  window.openTopUpModal = openTopUpModalWrapper;
  window.initWithdrawModal = initWithdrawModal;
  window.renderWithdrawModal = renderWithdrawModal;
  window.openWithdrawModal = openWithdrawModal;
  window.openDownloadApkModal = openDownloadApkModal;

})();
