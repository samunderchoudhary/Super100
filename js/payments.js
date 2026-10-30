(function () {
  "use strict";
  /* Razorpay-only online payments. Payment is credited only after server verification. */
  var API = ""; 
  var SDK = "https://checkout.razorpay.com/v1/checkout.js";
  var KEY = "payments:last";
  var sdk = null;

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }

  function base() {
    if (API) return String(API).replace(/\/+$/, "");
    if (typeof location !== "undefined") {
      var proto = location.protocol;
      var host = location.hostname;
      var port = location.port;
      
      if (!/^https?:$/.test(proto)) {
        return "http://localhost:3000";
      }
      if (host === "localhost" || host === "127.0.0.1") {
        if (port !== "3000") {
          return proto + "//" + host + ":3000";
        }
        return "";
      }
      return "";
    }
    return "http://localhost:3000";
  }

  function pause(ms) { return new Promise(function (done) { setTimeout(done, ms); }); }
  function remember(info) { try { localStorage.setItem(KEY, JSON.stringify(info)); } catch (e) { } }
  function recall() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }

  function call(route, init, fallbackAmount, fallbackReference) {
    var b = base();
    var targetUrl = (b ? b : "") + route;
    
    return fetch(targetUrl, init).then(function (r) {
      return r.json().then(function (d) { return d || {}; }, function () { return {}; }).then(function (d) {
        if (r.ok) return d;
        throw fail(d.error === "not_set_up" || r.status === 404 ? "not_set_up" : "server", d.message || "The payment server could not process the request.");
      });
    }, function () {
      throw fail("server", "Payment server unreachable. Please try again; no payment was created.");
    });
  }

  function loadSdk() {
    if (window.Razorpay) return Promise.resolve();
    if (!sdk) {
      sdk = new Promise(function (done, no) {
        var s = document.createElement("script");
        s.src = SDK;
        s.async = true;
        s.onload = function () { done(); };
        s.onerror = function () { 
          done(); 
        };
        document.head.appendChild(s);
      });
    }
    return sdk;
  }

  function verifyPayment(details) {
    return call("/api/payments/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        order_id: details.razorpay_order_id,
        payment_id: details.razorpay_payment_id,
        signature: details.razorpay_signature
      })
    }).then(function (result) {
      if (!result || result.status !== "PAID") throw fail("verification", "Razorpay could not confirm this payment.");
      return result;
    });
  }

  function finish(orderId, reference, closed, paymentDetails) {
    if (closed || !paymentDetails) {
      return Promise.resolve({
        status: closed ? "CANCELLED" : "PENDING",
        orderId: orderId,
        amount: 0,
        reference: reference || "",
        message: closed ? "The payment was cancelled." : "Payment confirmation is pending."
      });
    }
    return verifyPayment(paymentDetails).then(function (verified) {
      return { status: "PAID", orderId: orderId, amount: verified.amount || 0, reference: reference || "", message: "Payment verified successfully by Razorpay." };
    }).catch(function (err) {
      return { status: "PENDING", orderId: orderId, amount: 0, reference: reference || "", message: err && err.message ? err.message : "Payment is awaiting server verification." };
    });
  }

  function showRealCheckoutModal(order, amount, customerInfo, resolve) {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(11,15,25,0.85);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;animation:fadeIn 0.2s ease;";
    
    var card = document.createElement("div");
    card.style.cssText = "background:#111827;border:1px solid #374151;border-radius:16px;width:100%;max-width:420px;padding:28px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);color:#F3F4F6;";
    
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:rgba(37,99,235,0.2);color:#38BDF8;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;">🔒</div>' +
          '<div><div style="font-weight:700;font-size:16px;color:#F9FAFB;">Secure Razorpay Checkout</div><div style="font-size:12px;color:#9CA3AF;">Live Gateway Integration</div></div>' +
        '</div>' +
        '<div style="font-weight:700;font-size:18px;color:#38BDF8;">₹' + (amount / 100).toFixed(2) + '</div>' +
      '</div>' +
      '<div style="background:#1F2937;border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;color:#D1D5DB;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#9CA3AF;">Customer:</span><span style="font-weight:500;">' + (customerInfo.name || 'Player') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#9CA3AF;">Phone:</span><span style="font-weight:500;">' + (customerInfo.phone || '9876543210') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span style="color:#9CA3AF;">Purpose:</span><span style="font-weight:500;">' + (customerInfo.note || 'Token Topup') + '</span></div>' +
      '</div>' +
      '<div style="margin-bottom:20px;">' +
        '<label style="display:block;font-size:12px;color:#9CA3AF;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Select Payment Method</label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<button type="button" id="method-upi" style="background:#2563EB;border:1px solid #3B82F6;color:#fff;padding:10px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;transition:all 0.2s;">UPI / QR</button>' +
          '<button type="button" id="method-card" style="background:#1F2937;border:1px solid #374151;color:#D1D5DB;padding:10px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;transition:all 0.2s;">Card / NetBanking</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;">' +
        '<button type="button" id="checkout-cancel-btn" style="flex:1;background:#374151;color:#F3F4F6;border:none;padding:12px;border-radius:8px;font-weight:600;cursor:pointer;">Cancel</button>' +
        '<button type="button" id="checkout-pay-btn" style="flex:2;background:#2563EB;color:#fff;border:none;padding:12px;border-radius:8px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,0.3);">Pay ₹' + (amount / 100).toFixed(2) + '</button>' +
      '</div>';
      
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var upiBtn = card.querySelector("#method-upi");
    var cardBtn = card.querySelector("#method-card");
    var cancelBtn = card.querySelector("#checkout-cancel-btn");
    var payBtn = card.querySelector("#checkout-pay-btn");
    
    var selectedMethod = "upi";
    upiBtn.onclick = function() {
      selectedMethod = "upi";
      upiBtn.style.background = "#2563EB";
      upiBtn.style.borderColor = "#3B82F6";
      upiBtn.style.color = "#fff";
      cardBtn.style.background = "#1F2937";
      cardBtn.style.borderColor = "#374151";
      cardBtn.style.color = "#D1D5DB";
    };

    cardBtn.onclick = function() {
      selectedMethod = "card";
      cardBtn.style.background = "#2563EB";
      cardBtn.style.borderColor = "#3B82F6";
      cardBtn.style.color = "#fff";
      upiBtn.style.background = "#1F2937";
      upiBtn.style.borderColor = "#374151";
      upiBtn.style.color = "#D1D5DB";
    };

    cancelBtn.onclick = function() {
      document.body.removeChild(overlay);
      resolve({ success: false, cancelled: true });
    };

    payBtn.onclick = function() {
      payBtn.disabled = true;
      payBtn.textContent = "Launching Gateway...";
      
      loadSdk().then(function() {
        document.body.removeChild(overlay);
        
        if (window.Razorpay) {
          var options = {
            key: order.keyId,
            amount: amount,
            currency: "INR",
            name: "Token Arena",
            description: customerInfo.note || "Token Topup",
            order_id: order.orderId,
            prefill: {
              name: customerInfo.name || "",
              email: customerInfo.email || "",
              contact: customerInfo.phone || ""
            },
            handler: function (response) {
              resolve({ success: true, paymentDetails: response });
            },
            modal: {
              ondismiss: function () {
                resolve({ success: false, cancelled: true });
              }
            }
          };
          try {
            var rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (resp) {
              resolve({ success: false, error: resp.error });
            });
            rzp.open();
            return;
          } catch (e) {}
        }
        
        resolve({ success: false, error: new Error("Razorpay Checkout could not load. Check your internet connection and try again.") });
      });
    };
  }

  function begin(order, reference, amount, customerInfo) {
    if (!order || !order.orderId) {
      throw fail("server", "Invalid order generated from server.");
    }
    remember({ orderId: order.orderId, reference: reference });
    return loadSdk()
      .then(function () {
        return new Promise(function (resolve) {
          showRealCheckoutModal(order, Math.round(amount * 100), customerInfo, resolve);
        });
      })
      .then(function (res) {
        if (res.success) {
          return finish(order.orderId, reference, false, res.paymentDetails);
        } else if (res.cancelled) {
          return { status: "CANCELLED", orderId: order.orderId, amount: amount, reference: reference, message: "The payment was cancelled." };
        } else {
          return { status: "FAILED", orderId: order.orderId, amount: amount, reference: reference, message: "The payment failed or was declined." };
        }
      });
  }

  function start(o) {
    o = o || {};
    var amount = Math.round(Number(o.amount) * 100) / 100;
    var reference = String(o.reference || "");
    if (!(amount >= 1)) return Promise.resolve({ status: "INVALID", orderId: "", amount: 0, reference: reference, message: "The amount must be at least 1 rupee (1 Token = ₹1)." });
    
    var computedReturnUrl = "";
    try {
      computedReturnUrl = window.location.origin + window.location.pathname;
    } catch (err) {
      computedReturnUrl = "";
    }

    return call("/api/payments/order", { 
      method: "POST", 
      headers: { "content-type": "application/json" }, 
      body: JSON.stringify({ amount: amount, name: o.name || "", email: o.email || "", phone: o.phone || "", note: o.note || "", return_url: computedReturnUrl }) 
    })
      .then(function (d) {
        if (!d || !d.orderId || !d.keyId) throw fail("server", "Razorpay order was not created. Check your server keys.");
        return begin(d, reference, amount, o);
      });
  }

  function open(order, reference) {
    order = order || {};
    if (!order.orderId) {
      return Promise.resolve({ status: "INVALID", orderId: "", amount: 0, reference: reference, message: "No valid order to open." });
    }
    return begin(order, String(reference || ""), Number(order.amount) || 0, {});
  }

  function returned() {
    var id = "";
    try { id = new URLSearchParams(location.search).get("payment_order") || ""; } catch (e) { id = ""; }
    if (!id) return Promise.resolve(null);
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    var last = recall();
    var reference = last && last.orderId === id ? last.reference : "";
    return call("/api/payments/status?order_id=" + encodeURIComponent(id)).then(function (s) {
      return { status: s.status || "PENDING", orderId: id, amount: s.amount || 0, reference: reference, message: s.status === "PAID" ? "Payment status confirmed by Razorpay." : "Payment is awaiting confirmation." };
    }).catch(function () {
      return { status: "PENDING", orderId: id, amount: 0, reference: reference, message: "Payment is awaiting server confirmation." };
    });
  }

  function createUpiQr(amount, reference) {
    return call("/api/payments/upi-qr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), reference: String(reference || "") })
    }).then(function (result) {
      if (!result || !result.qrId || !result.imageUrl) throw fail("qr", "Razorpay did not return a UPI QR code.");
      return result;
    });
  }

  function checkUpiQr(qrId) {
    return call("/api/payments/upi-qr/status?qr_id=" + encodeURIComponent(qrId), { method: "GET" });
  }

  window.Payments = {
    ready: function () { return true; },
    start: start,
    open: open,
    returned: returned,
    createUpiQr: createUpiQr,
    checkUpiQr: checkUpiQr
  };
})();
