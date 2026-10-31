(function () {
  'use strict';

  var auth = null;
  var currentUser = null;
  var currentProfile = null;
  var store = null;
  var bootstrapPromises = {};
  var registrationDetails = null;
  var pendingReferralCode = '';
  var modal = null;

  function cleanReferralCode(value) {
    var code = String(value || '').trim().toUpperCase();
    return /^[A-Z0-9]{8,12}$/.test(code) ? code : '';
  }

  function captureReferralCode() {
    try {
      var params = new URLSearchParams(window.location.search);
      var code = cleanReferralCode(params.get('ref'));
      if (code) {
        pendingReferralCode = code;
        localStorage.setItem('super100_pending_referral_code', code);
      } else {
        pendingReferralCode = cleanReferralCode(localStorage.getItem('super100_pending_referral_code'));
      }
    } catch (e) { pendingReferralCode = ''; }
  }

  function makeModal() {
    modal = document.createElement('div');
    modal.id = 'super100-auth-gate';
    modal.className = 'modal-backdrop open';
    modal.style.zIndex = '5000';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:470px;max-height:92vh;overflow-y:auto;">
        <div class="modal-header">
          <h2 class="modal-title">Super100 Account</h2>
          <span style="font-size:.78rem;color:var(--text-muted);">Secure account access</span>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;gap:8px;">
            <button type="button" id="auth-tab-login" class="btn btn-primary" style="flex:1;">Login</button>
            <button type="button" id="auth-tab-register" class="btn btn-outline" style="flex:1;">Create account</button>
          </div>
          <form id="auth-login-form" style="display:flex;flex-direction:column;gap:12px;">
            <div class="form-group"><label class="form-label" for="auth-login-email">Email address</label><input id="auth-login-email" class="input-control" type="email" autocomplete="email" required placeholder="you@example.com"></div>
            <div class="form-group"><label class="form-label" for="auth-login-password">Password</label><input id="auth-login-password" class="input-control" type="password" autocomplete="current-password" required placeholder="Your password"></div>
            <button class="btn btn-primary btn-block" type="submit">Login</button>
            <button class="btn btn-outline btn-block" id="auth-forgot-password" type="button">Forgot password?</button>
          </form>
          <form id="auth-register-form" style="display:none;flex-direction:column;gap:12px;">
            <div class="form-group"><label class="form-label" for="auth-name">Full name</label><input id="auth-name" class="input-control" type="text" autocomplete="name" maxlength="80" required placeholder="Your name"></div>
            <div class="form-group"><label class="form-label" for="auth-phone">Phone number</label><input id="auth-phone" class="input-control" type="tel" autocomplete="tel" maxlength="16" required placeholder="10-digit mobile number"><small style="color:var(--text-muted);">Saved to your profile. No OTP is sent and the number is not verified.</small></div>
            <div class="form-group"><label class="form-label" for="auth-register-email">Email address</label><input id="auth-register-email" class="input-control" type="email" autocomplete="email" required placeholder="you@example.com"></div>
            <div class="form-group"><label class="form-label" for="auth-register-password">Create password</label><input id="auth-register-password" class="input-control" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></div>
            <div class="form-group"><label class="form-label" for="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" class="input-control" type="password" autocomplete="new-password" minlength="8" required placeholder="Re-enter password"></div>
            <div id="auth-referral-note" style="display:none;background:rgba(56,189,248,.08);border:1px solid var(--electric-cyan);border-radius:10px;padding:10px;font-size:.85rem;">Referral link detected. If your registration is eligible, you will receive 100 tokens and your referrer will receive 200 tokens.</div>
            <button class="btn btn-primary btn-block" type="submit">Create account</button>
          </form>
          <div id="auth-message" role="alert" style="display:none;color:var(--error-coral);font-size:.85rem;line-height:1.5;"></div>
          <div style="font-size:.75rem;color:var(--text-muted);line-height:1.5;">Use an email address and password you control. Phone numbers are profile details only; there is no SMS verification.</div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    var loginTab = modal.querySelector('#auth-tab-login');
    var registerTab = modal.querySelector('#auth-tab-register');
    var loginForm = modal.querySelector('#auth-login-form');
    var registerForm = modal.querySelector('#auth-register-form');
    var message = modal.querySelector('#auth-message');

    function showMessage(text, isError) {
      message.textContent = text;
      message.style.display = text ? 'block' : 'none';
      message.style.color = isError === false ? 'var(--success-light)' : 'var(--error-coral)';
    }
    function setTab(tab) {
      var isRegister = tab === 'register';
      loginForm.style.display = isRegister ? 'none' : 'flex';
      registerForm.style.display = isRegister ? 'flex' : 'none';
      loginTab.className = isRegister ? 'btn btn-outline' : 'btn btn-primary';
      registerTab.className = isRegister ? 'btn btn-primary' : 'btn btn-outline';
      showMessage('');
    }
    loginTab.onclick = function () { setTab('login'); };
    registerTab.onclick = function () { setTab('register'); };
    if (pendingReferralCode) modal.querySelector('#auth-referral-note').style.display = 'block';

    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      showMessage('Signing in…', false);
      try {
        await auth.signInWithEmailAndPassword(
          modal.querySelector('#auth-login-email').value.trim(),
          modal.querySelector('#auth-login-password').value
        );
      } catch (e) { showMessage(authError(e)); }
    });

    registerForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      var name = modal.querySelector('#auth-name').value.trim();
      var phone = modal.querySelector('#auth-phone').value.trim();
      var email = modal.querySelector('#auth-register-email').value.trim();
      var password = modal.querySelector('#auth-register-password').value;
      var confirm = modal.querySelector('#auth-confirm-password').value;
      if (password.length < 8) return showMessage('Please use a password with at least 8 characters.');
      if (password !== confirm) return showMessage('The passwords do not match.');
      if (phone.replace(/\D/g, '').length < 10 || phone.replace(/\D/g, '').length > 15) return showMessage('Enter a valid phone number (10–15 digits).');
      registrationDetails = { displayName: name, phone: phone, referralCode: pendingReferralCode };
      showMessage('Creating your account…', false);
      try {
        var credential = await auth.createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName: name });
        await bootstrapForUser(credential.user, registrationDetails);
      } catch (e) {
        showMessage(authError(e));
        registrationDetails = null;
      }
    });

    modal.querySelector('#auth-forgot-password').onclick = async function () {
      var email = modal.querySelector('#auth-login-email').value.trim();
      if (!email) return showMessage('Enter your email address first.');
      try {
        await auth.sendPasswordResetEmail(email);
        showMessage('Password reset instructions have been sent to your email.', false);
      } catch (e) { showMessage(authError(e)); }
    };
  }

  function authError(error) {
    var code = error && error.code || '';
    var map = {
      'auth/email-already-in-use': 'An account with this email already exists. Please log in.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
      'auth/user-not-found': 'No account was found for this email.',
      'auth/wrong-password': 'The password is incorrect.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
      'auth/network-request-failed': 'Network error. Check your internet connection.'
    };
    return map[code] || (error && error.message) || 'Authentication failed. Please try again.';
  }

  async function api(url, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (currentUser) headers.Authorization = 'Bearer ' + await currentUser.getIdToken();
    var response = await fetch(url, Object.assign({}, options, { headers: headers, cache: 'no-store' }));
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.message || 'The account service is unavailable.');
    return data;
  }

  async function applyReferralCredits(profile) {
    // Referral rewards are credited to the Firestore wallet by the server transaction.
    // Never add referral rewards to localStorage: the browser wallet is not authoritative.
    if (!currentUser || !profile) return;
    try {
      var wallet = await api('/api/wallet/me', { method: 'GET' });
      window.Super100ServerWallet = wallet;
      window.dispatchEvent(new CustomEvent('super100:server-wallet-loaded', { detail: wallet }));
    } catch (e) {
      console.warn('Server wallet could not be loaded:', e);
    }
  }

  function bootstrapForUser(user, details) {
    if (!user) return Promise.resolve(null);
    currentUser = user;
    if (bootstrapPromises[user.uid]) return bootstrapPromises[user.uid];
    details = details || {};
    bootstrapPromises[user.uid] = api('/api/account/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        displayName: details.displayName || user.displayName || '',
        email: user.email || '',
        phone: details.phone || '',
        referralCode: details.referralCode || pendingReferralCode || ''
      })
    }).then(function (profile) {
      currentProfile = profile;
      renderReferralLink(profile);
      applyReferralCredits(profile);
      if (details.phone && store && typeof store.setUserPhone === 'function') store.setUserPhone(details.phone);
      var params = new URLSearchParams(window.location.search);
      if (params.has('ref')) {
        params.delete('ref');
        window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash);
      }
      return profile;
    }).catch(function (error) {
      delete bootstrapPromises[user.uid];
      throw error;
    });
    return bootstrapPromises[user.uid];
  }

  async function askReferralConfirmation(profile) {
    if (!currentUser || !profile || profile.alreadyRegistered || profile.referredBy || !pendingReferralCode) return;
    if (localStorage.getItem('super100_referral_decision_' + currentUser.uid)) return;

    var overlay = document.createElement('div');
    overlay.className = 'modal-backdrop open';
    overlay.style.zIndex = '5100';
    overlay.innerHTML = '<div class="modal-card" style="max-width:440px;"><div class="modal-header"><h3 class="modal-title">Were you referred by someone?</h3></div><div class="modal-body" style="display:flex;flex-direction:column;gap:12px;"><p style="color:var(--text-slate);font-size:.9rem;line-height:1.5;">If a friend shared your Super100 invitation link, choose Yes and enter the mobile number registered to their account. You receive 100 tokens and they receive 200 tokens after verification.</p><div id="referral-claim-fields" style="display:none;"><label class="form-label" for="referrer-mobile-input">Referrer’s registered mobile number</label><input id="referrer-mobile-input" class="input-control" type="tel" maxlength="16" placeholder="Enter mobile number"></div><div id="referral-claim-message" role="alert" style="display:none;color:var(--error-coral);font-size:.85rem;"></div><div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn btn-primary" id="referral-confirm-yes">Yes, I was referred</button><button type="button" class="btn btn-outline" id="referral-confirm-no">No, I was not referred</button></div><button type="button" class="btn btn-success btn-block" id="referral-submit-claim" style="display:none;">Verify and claim 100 tokens</button></div></div>';
    document.body.appendChild(overlay);
    var fields = overlay.querySelector('#referral-claim-fields');
    var message = overlay.querySelector('#referral-claim-message');
    overlay.querySelector('#referral-confirm-yes').onclick = function () {
      fields.style.display = 'block';
      overlay.querySelector('#referral-submit-claim').style.display = 'block';
      overlay.querySelector('#referral-confirm-yes').style.display = 'none';
      overlay.querySelector('#referral-confirm-no').textContent = 'Cancel';
    };
    overlay.querySelector('#referral-confirm-no').onclick = async function () {
      if (fields.style.display === 'block') {
        fields.style.display = 'none';
        overlay.querySelector('#referral-submit-claim').style.display = 'none';
        overlay.querySelector('#referral-confirm-yes').style.display = 'inline-flex';
        overlay.querySelector('#referral-confirm-no').textContent = 'No, I was not referred';
        return;
      }
      try {
        await api('/api/referrals/decline', { method: 'POST', body: JSON.stringify({}) });
      } catch (declineError) {
        message.textContent = declineError.message || 'Could not save your choice. Please try again.';
        message.style.display = 'block';
        return;
      }
      localStorage.setItem('super100_referral_decision_' + currentUser.uid, 'no');
      localStorage.removeItem('super100_pending_referral_code');
      pendingReferralCode = '';
      overlay.remove();
    };
    overlay.querySelector('#referral-submit-claim').onclick = async function () {
      var phone = overlay.querySelector('#referrer-mobile-input').value.trim();
      if (phone.replace(/\\D/g, '').length < 10) {
        message.textContent = 'Enter the referrer’s valid mobile number.';
        message.style.display = 'block';
        return;
      }
      var button = overlay.querySelector('#referral-submit-claim');
      button.disabled = true;
      button.textContent = 'Verifying…';
      message.style.display = 'none';
      try {
        var result = await api('/api/referrals/claim', {
          method: 'POST',
          body: JSON.stringify({ referrerPhone: phone, referralCode: pendingReferralCode })
        });
        localStorage.setItem('super100_referral_decision_' + currentUser.uid, 'yes');
        localStorage.removeItem('super100_pending_referral_code');
        pendingReferralCode = '';
        currentProfile.referredBy = true;
        if (window.showToast) window.showToast('Referral verified! 100 tokens credited to your account.', 'success');
        try {
          var wallet = await api('/api/wallet/me', { method: 'GET' });
          window.Super100ServerWallet = wallet;
          window.dispatchEvent(new CustomEvent('super100:server-wallet-loaded', { detail: wallet }));
        } catch (walletError) {}
        overlay.remove();
      } catch (error) {
        message.textContent = error.message || 'Could not verify this referral.';
        message.style.display = 'block';
        button.disabled = false;
        button.textContent = 'Verify and claim 100 tokens';
      }
    };
  }

  function renderReferralLink(profile) {
    if (!profile || !profile.referralCode) return;
    var host = document.getElementById('referral-modal');
    if (!host || host.querySelector('#super100-referral-link-panel')) return;
    var body = host.querySelector('.modal-body') || host;
    var codeLabel = host.querySelector('#referral-my-id');
    if (codeLabel) codeLabel.textContent = profile.referralCode;
    var countLabel = host.querySelector('#referral-stat-count');
    if (countLabel) countLabel.textContent = String(Number(profile.referralCount || 0));
    var earnedLabel = host.querySelector('#referral-stat-earned');
    if (earnedLabel) earnedLabel.textContent = Number(profile.referralRewardTotal || 0).toLocaleString() + ' Tokens';
    var legacyPhoneForm = host.querySelector('#referral-phone-form');
    var legacyApplyForm = host.querySelector('#referral-apply-form');
    if (legacyPhoneForm) legacyPhoneForm.style.display = 'none';
    if (legacyApplyForm) legacyApplyForm.style.display = 'none';
    var panel = document.createElement('section');
    panel.id = 'super100-referral-link-panel';
    panel.style.cssText = 'margin:12px 0;padding:14px;border:1px solid var(--electric-cyan);border-radius:12px;background:rgba(56,189,248,.07);';
    var link = window.location.origin + window.location.pathname + '?ref=' + encodeURIComponent(profile.referralCode);
    panel.innerHTML = '<div style="font-weight:800;margin-bottom:6px;">Your Super100 referral link</div>' +
      '<div style="font-size:.82rem;word-break:break-all;margin-bottom:10px;" id="super100-referral-link-text"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn btn-primary" id="super100-copy-referral-link">Copy link</button><button type="button" class="btn btn-outline" id="super100-share-referral-link">Share link</button></div>' +
      '<div style="font-size:.78rem;margin-top:8px;color:var(--text-muted);">Eligible new accounts receive 100 tokens; you receive 200 tokens. Rewards are recorded by the server.</div>';
    body.insertBefore(panel, body.firstChild);
    panel.querySelector('#super100-referral-link-text').textContent = link;
    panel.querySelector('#super100-copy-referral-link').onclick = async function () {
      try { await navigator.clipboard.writeText(link); if (window.showToast) window.showToast('Referral link copied.', 'success'); }
      catch (e) { if (window.showToast) window.showToast('Please copy the referral link shown above.', 'warning'); }
    };
    panel.querySelector('#super100-share-referral-link').onclick = async function () {
      try {
        if (navigator.share) await navigator.share({ title: 'Join me on Super100', text: 'Use my Super100 referral link:', url: link });
        else { await navigator.clipboard.writeText(link); if (window.showToast) window.showToast('Referral link copied.', 'success'); }
      } catch (e) { /* User cancelled sharing; no action needed. */ }
    };
  }

  function setGate(open) {
    if (!modal) return;
    modal.classList.toggle('open', Boolean(open));
  }

  function bindAccountButton() {
    var button = document.getElementById('account-nav-btn');
    var label = document.getElementById('account-nav-label');
    if (!button) return;
    button.onclick = async function () {
      if (!currentUser) return setGate(true);
      var doLogout = window.confirm('Sign out of Super100?');
      if (!doLogout) return;
      try { await auth.signOut(); }
      catch (e) { if (window.showToast) window.showToast(authError(e), 'error'); }
    };
    if (label) label.textContent = currentUser ? 'Sign out' : 'Sign in';
  }

  async function init(tokenStore) {
    store = tokenStore;
    captureReferralCode();
    makeModal();
    bindAccountButton();
    try {
      var response = await fetch('/api/firebase-config', { cache: 'no-store' });
      var config = await response.json();
      if (!response.ok || !config.apiKey || !config.projectId || !config.appId) {
        throw new Error('Firebase web app settings are not configured on Render yet. Complete the Firebase setup instructions in FIREBASE-SETUP.md.');
      }
      if (!window.firebase) throw new Error('Firebase client library could not load. Refresh the page and try again.');
      if (!window.firebase.apps.length) window.firebase.initializeApp(config);
      auth = window.firebase.auth();
      await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
      auth.onAuthStateChanged(async function (user) {
        currentUser = user;
        bindAccountButton();
        if (!user) {
          currentProfile = null;
          setGate(true);
          return;
        }
        try {
          var profile = await bootstrapForUser(user, registrationDetails || {});
          registrationDetails = null;
          setGate(false);
          await askReferralConfirmation(profile);
          if (window.showToast) window.showToast('Welcome to Super100, ' + (profile.displayName || user.email) + '!', 'success');
        } catch (error) {
          setGate(true);
          var message = modal && modal.querySelector('#auth-message');
          if (message) { message.textContent = error.message; message.style.display = 'block'; }
        }
      });
    } catch (error) {
      setGate(true);
      var message = modal.querySelector('#auth-message');
      message.textContent = error.message;
      message.style.display = 'block';
    }
  }

  window.Super100Auth = {
    init: init,
    api: api,
    getUser: function () { return currentUser; },
    getProfile: function () { return currentProfile; },
    openGate: function () { setGate(true); }
  };
})();
