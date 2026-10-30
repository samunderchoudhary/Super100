"use strict";
/* Razorpay payment server for this project.
 * Needs Node.js 18 or newer. There is nothing to install. Start it with:  node server/razorpay-server.js
 * Your gateway keys live in server/.env on this server only. Never put them in antiselected frontend code.
 * fatse-shop-template: 3 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_VERSION = "2025-01-01";
const ID_RE = /^[A-Za-z0-9_-]{3,45}$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,40}$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

function loadEnv(file, env) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return; }
  text.split(/\r?\n/).forEach(function (line) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
}

function cleanPhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.charAt(0) === "+" && digits.slice(0, 2) !== "91") return digits.length >= 8 && digits.length <= 15 ? "+" + digits : "";
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? ten : "";
}

function create(options) {
  options = options || {};
  const env = Object.assign({}, options.env || process.env);
  if (!options.env) loadEnv(path.join(__dirname, ".env"), env);
  const dataDir = path.resolve(options.dataDir || env.DATA_DIR || __dirname);
  const shopDir = path.join(dataDir, "shop-data");
  const ledger = path.join(dataDir, "paid-orders.json");

  // Read Razorpay keys requested by user
  let rzpKeyId = env.RAZORPAY_KEY_ID || "";
  let rzpKeySecret = env.RAZORPAY_KEY_SECRET || "";
  
  const live = rzpKeyId.startsWith("rzp_live_");
  
  const doFetch = options.fetch || fetch;
  const port = Number(env.PORT) || 3000;
  const publicUrl = String(env.PUBLIC_URL || "").replace(/\/+$/, "");
  const origins = String(env.ALLOWED_ORIGINS || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  const maxAmount = Number(env.MAX_AMOUNT) || 200000;
  const trustProxy = env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true";
  const siteDir = path.resolve(options.siteDir || env.SITE_DIR || path.join(__dirname, ".."));
  const hasSite = fs.existsSync(path.join(siteDir, "index.html"));
  const warnings = [];

  const reply = function (status, body) { return { status: status, body: body }; };
  const problem = function (status, error, message) { return reply(status, { error: error, message: message }); };

  function send(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin || (origins.indexOf("*") < 0 && origins.indexOf(origin) < 0)) return;
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-headers", "content-type,authorization");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("vary", "origin");
  }

  function readBody(req, limit) {
    const max = limit || 100000;
    return new Promise(function (resolve, reject) {
      const chunks = [];
      let size = 0;
      req.on("data", function (chunk) {
        size += chunk.length;
        if (size <= max) chunks.push(chunk);
      });
      req.on("end", function () { if (size > max) reject(new Error("too big")); else resolve(Buffer.concat(chunks).toString("utf8")); });
      req.on("error", reject);
    });
  }

  async function jsonBody(req, limit) {
    const raw = await readBody(req, limit);
    let body = null;
    try { body = JSON.parse(raw); } catch (e) { body = null; }
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  }

  function markPaid(orderId, amount) {
    let all = {};
    try { all = JSON.parse(fs.readFileSync(ledger, "utf8")); } catch (e) { all = {}; }
    if (all[orderId]) return;
    all[orderId] = { amount: amount, paidAt: new Date().toISOString() };
    try { fs.writeFileSync(ledger, JSON.stringify(all, null, 2)); } catch (e) {}
  }

  function baseOf(req) {
    if (publicUrl) return publicUrl;
    const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" ? "https" : "http";
    return proto + "://" + (req.headers.host || "localhost:" + port);
  }

  // Create Razorpay Order
  async function placeRazorpayOrder(o, base) {
    if (!rzpKeyId || !rzpKeySecret) return problem(503, "not_set_up", "Razorpay keys are not configured.");
    const orderId = "order_" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
    const amountInPaise = Math.round(o.amount * 100);
    
    const authHeader = "Basic " + Buffer.from(rzpKeyId + ":" + rzpKeySecret).toString("base64");
    
    let r;
    try {
      r = await doFetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "authorization": authHeader,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: orderId,
          notes: {
            note: o.note || "Token Deposit",
            phone: o.phone || "",
            email: o.email || ""
          }
        }),
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      return problem(502, "gateway", "Could not reach Razorpay. Please try again.");
    }

    let data = {};
    try { data = await r.json(); } catch (e) {}
    
    if (!r.ok || !data.id) {
      return problem(502, "gateway", String(data.error && data.error.description || "Razorpay order creation failed."));
    }

    return reply(200, {
      orderId: data.id,
      keyId: rzpKeyId,
      amount: o.amount,
      currency: "INR",
      mode: live ? "production" : "sandbox",
      customer: { name: o.name, email: o.email, phone: o.phone }
    });
  }

  async function createOrder(body, base) {
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!(amount >= 1) || amount > maxAmount) return problem(400, "amount", "The amount must be between 1 and " + maxAmount + " rupees.");
    const phone = cleanPhone(body.phone);
    if (!phone) return problem(400, "phone", "Enter a valid 10-digit mobile number.");
    return placeRazorpayOrder({ amount: amount, phone: phone, email: body.email, name: body.name, note: body.note }, base);
  }

  async function orderStatus(id) {
    if (!ID_RE.test(id)) return problem(400, "order", "That order number is not valid.");
    if (!rzpKeyId || !rzpKeySecret) return problem(503, "not_set_up", "Razorpay not set up.");
    
    const authHeader = "Basic " + Buffer.from(rzpKeyId + ":" + rzpKeySecret).toString("base64");
    let r;
    try {
      r = await doFetch("https://api.razorpay.com/v1/orders/" + id, {
        method: "GET",
        headers: { "authorization": authHeader }
      });
    } catch (e) {
      return problem(502, "gateway", "Could not reach Razorpay.");
    }

    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok || !data.id) return problem(502, "gateway", "Could not fetch order status.");

    const status = data.status === "paid" ? "PAID" : "PENDING";
    if (status === "PAID") {
      markPaid(id, data.amount / 100);
    }
    return reply(200, { orderId: id, status: status, amount: data.amount / 100 });
  }

  function verifyRazorpaySignature(orderId, paymentId, signature) {
    if (!orderId || !paymentId || !signature || !rzpKeySecret) return false;
    const expected = crypto.createHmac("sha256", rzpKeySecret)
      .update(orderId + "|" + paymentId).digest("hex");
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(String(signature), "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) { return false; }
  }

  async function verifyPayment(body) {
    const orderId = String(body.order_id || "");
    const paymentId = String(body.payment_id || "");
    const signature = String(body.signature || "");
    if (!ID_RE.test(orderId) || !ID_RE.test(paymentId) || !verifyRazorpaySignature(orderId, paymentId, signature)) {
      return problem(400, "verification_failed", "Razorpay payment signature could not be verified.");
    }
    const authHeader = "Basic " + Buffer.from(rzpKeyId + ":" + rzpKeySecret).toString("base64");
    let r;
    try {
      r = await doFetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId), {
        method: "GET", headers: { "authorization": authHeader }, signal: AbortSignal.timeout(15000)
      });
    } catch (e) { return problem(502, "gateway", "Could not verify payment with Razorpay."); }
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok || data.order_id !== orderId || data.status !== "captured") {
      return problem(402, "not_captured", "Razorpay has not confirmed this payment as captured.");
    }
    markPaid(orderId, data.amount / 100);
    return reply(200, { orderId: orderId, paymentId: paymentId, status: "PAID", amount: data.amount / 100 });
  }


  // Create a one-time, fixed-amount Razorpay UPI QR for this token purchase.
  async function createUpiQr(body) {
    const amount = Math.round(Number(body.amount) * 100);
    if (!(amount >= 100) || amount > maxAmount * 100) {
      return problem(400, "amount", "The amount is outside the permitted range.");
    }
    if (!rzpKeyId || !rzpKeySecret) return problem(503, "not_set_up", "Razorpay keys are not configured.");
    const reference = String(body.reference || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || ("TOKEN" + Date.now());
    const authHeader = "Basic " + Buffer.from(rzpKeyId + ":" + rzpKeySecret).toString("base64");
    const closeBy = Math.floor(Date.now() / 1000) + 30 * 60;
    let response;
    try {
      response = await doFetch("https://api.razorpay.com/v1/payments/qr_codes", {
        method: "POST",
        headers: { "authorization": authHeader, "content-type": "application/json" },
        body: JSON.stringify({
          type: "upi_qr",
          name: "Token Arena",
          usage: "single_use",
          fixed_amount: true,
          payment_amount: amount,
          description: "Token purchase " + reference,
          close_by: closeBy,
          notes: { reference: reference }
        }),
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      return problem(502, "gateway", "Could not create a UPI QR with Razorpay.");
    }
    let data = {};
    try { data = await response.json(); } catch (e) {}
    if (!response.ok || !data.id || !data.image_url) {
      return problem(502, "qr_unavailable", String(data.error && data.error.description || "Razorpay UPI QR creation failed. Check whether QR Codes API is enabled for your account."));
    }
    return reply(200, { qrId: data.id, imageUrl: data.image_url, amount: amount / 100, currency: "INR", status: data.status || "active" });
  }

  // Only report PAID after Razorpay's authenticated API confirms a captured
  // payment against this exact single-use QR and exact amount.
  async function upiQrStatus(qrId) {
    if (!/^qr_[A-Za-z0-9]+$/.test(qrId)) return problem(400, "qr", "Invalid QR reference.");
    if (!rzpKeyId || !rzpKeySecret) return problem(503, "not_set_up", "Razorpay keys are not configured.");
    const authHeader = "Basic " + Buffer.from(rzpKeyId + ":" + rzpKeySecret).toString("base64");
    async function getJson(url) {
      const r = await doFetch(url, { method: "GET", headers: { "authorization": authHeader }, signal: AbortSignal.timeout(15000) });
      let d = {};
      try { d = await r.json(); } catch (e) {}
      if (!r.ok) throw new Error("Razorpay status lookup failed.");
      return d;
    }
    try {
      const qr = await getJson("https://api.razorpay.com/v1/payments/qr_codes/" + encodeURIComponent(qrId));
      const payments = await getJson("https://api.razorpay.com/v1/payments/qr_codes/" + encodeURIComponent(qrId) + "/payments");
      const items = Array.isArray(payments.items) ? payments.items : [];
      const expectedPaise = Number(qr.payment_amount);
      const receivedPaise = Number(qr.payments_amount_received || 0);

      // Razorpay documents payments_amount_received as the sum of captured
      // payments only. This is the primary confirmation for a fixed-amount,
      // single-use QR, even if the payment-list response is briefly delayed.
      const captured = items.find(function (p) {
        return p && p.status === "captured" &&
          Number(p.amount) === expectedPaise &&
          String(p.currency || "INR").toUpperCase() === "INR";
      });

      const isCorrectFixedSingleUseQr =
        qr.type === "upi_qr" &&
        qr.usage === "single_use" &&
        qr.fixed_amount === true &&
        expectedPaise > 0;

      if (isCorrectFixedSingleUseQr && receivedPaise === expectedPaise &&
          Number(qr.payments_count_received || 0) >= 1) {
        markPaid(qrId, expectedPaise / 100);
        return reply(200, {
          qrId: qrId, status: "PAID", amount: expectedPaise / 100,
          paymentId: captured ? captured.id : null,
          verifiedBy: "razorpay_qr_captured_total"
        });
      }

      if (captured && isCorrectFixedSingleUseQr) {
        markPaid(qrId, expectedPaise / 100);
        return reply(200, { qrId: qrId, status: "PAID", amount: expectedPaise / 100, paymentId: captured.id });
      }

      return reply(200, {
        qrId: qrId, status: "PENDING", amount: 0,
        receivedAmount: receivedPaise / 100,
        paymentCount: Number(qr.payments_count_received || 0),
        qrStatus: qr.status || "unknown"
      });
    } catch (e) {
      return problem(502, "gateway", "Could not verify the UPI payment with Razorpay. No tokens have been credited.");
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname;
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    
    if (route === "/api/payments/health" && req.method === "GET") {
      return send(res, 200, { ok: true, mode: live ? "production" : "sandbox", keys: Boolean(rzpKeyId && rzpKeySecret) });
    }
    if (route === "/api/payments/order" && req.method === "POST") {
      const raw = await readBody(req);
      let body = null;
      try { body = JSON.parse(raw); } catch (e) {}
      if (!body || typeof body !== "object") return send(res, 400, { error: "body", message: "Send order details as JSON." });
      const r = await createOrder(body, baseOf(req));
      return send(res, r.status, r.body);
    }
    if (route === "/api/payments/status" && req.method === "GET") {
      const r = await orderStatus(url.searchParams.get("order_id") || "");
      return send(res, r.status, r.body);
    }
    if (route === "/api/payments/verify" && req.method === "POST") {
      const body = await jsonBody(req);
      if (!body) return send(res, 400, { error: "body", message: "Send Razorpay payment details as JSON." });
      const r = await verifyPayment(body);
      return send(res, r.status, r.body);
    }
    if (route === "/api/payments/upi-qr" && req.method === "POST") {
      const body = await jsonBody(req);
      if (!body) return send(res, 400, { error: "body", message: "Send QR purchase details as JSON." });
      const r = await createUpiQr(body);
      return send(res, r.status, r.body);
    }
    if (route === "/api/payments/upi-qr/status" && req.method === "GET") {
      const r = await upiQrStatus(url.searchParams.get("qr_id") || "");
      return send(res, r.status, r.body);
    }

    // Static serving or 404
    let rel = "";
    try { rel = decodeURIComponent(route); } catch (e) { return send(res, 400, { error: "path", message: "Bad path." }); }
    const parts = rel.split("/").filter(Boolean);
    let file = path.join(siteDir, parts.join(path.sep));
    if (file !== siteDir && file.indexOf(siteDir + path.sep) !== 0) return send(res, 404, { error: "not_found", message: "Not found." });
    
    fs.stat(file, function (e, st) {
      if (!e && st.isDirectory()) file = path.join(file, "index.html");
      fs.readFile(file, function (err, data) {
        if (err) return send(res, 404, { error: "not_found", message: "Not found." });
        res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
        res.end(req.method === "HEAD" ? undefined : data);
      });
    });
  }

  const server = http.createServer(function (req, res) {
    handle(req, res).catch(function (e) {
      if (!res.headersSent) send(res, 500, { error: "server", message: "Server error." });
      else res.end();
    });
  });
  return { server: server, port: port, live: live, hasSite: hasSite, warnings: warnings };
}

module.exports = { create: create };

if (require.main === module) {
  const app = create();
  app.server.listen(app.port, function () {
    console.log("TokenArena Payment & Web Server running at http://localhost:" + app.port + (app.live ? " (LIVE REAL MONEY ENABLED)" : ""));
  });
}
