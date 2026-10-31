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

  // Firebase Admin is optional at local startup, but required for authenticated accounts/referrals.
  let firebaseAdmin = null;
  let firestore = null;
  try {
    firebaseAdmin = require("firebase-admin");
    let serviceAccount = null;
    const serviceAccountPath = env.FIREBASE_SERVICE_ACCOUNT_PATH || "/etc/secrets/super100-firebase-admin.json";
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    else if (fs.existsSync(serviceAccountPath)) serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    if (serviceAccount) {
      if (!firebaseAdmin.apps.length) {
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(serviceAccount),
          projectId: env.FIREBASE_PROJECT_ID || serviceAccount.project_id
        });
      }
      firestore = firebaseAdmin.firestore();
    } else {
      warnings.push("Firebase service account not configured; account and referral APIs are disabled.");
    }
  } catch (e) {
    warnings.push("Firebase Admin could not initialize: " + e.message);
  }

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


  // Firebase Authentication + Firestore-backed profiles and one-time referral rewards.
  function firebaseConfig() {
    const projectId = env.FIREBASE_PROJECT_ID || "";
    return {
      apiKey: env.FIREBASE_API_KEY || "",
      authDomain: env.FIREBASE_AUTH_DOMAIN || (projectId ? projectId + ".firebaseapp.com" : ""),
      projectId: projectId,
      appId: env.FIREBASE_APP_ID || "",
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || ""
    };
  }

  async function authenticatedUid(req) {
    if (!firebaseAdmin || !firestore) throw new Error("Firebase account service is not configured.");
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new Error("Please sign in to continue.");
    const decoded = await firebaseAdmin.auth().verifyIdToken(match[1]);
    return decoded.uid;
  }

  function makeReferralCode() {
    return crypto.randomBytes(5).toString("hex").toUpperCase();
  }

  function normaliseProfilePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? digits : "";
  }

  async function bootstrapAccount(req, body) {
    if (!firebaseAdmin || !firestore) return problem(503, "firebase_not_configured", "Firebase Admin is not configured on the server yet.");
    let uid;
    try { uid = await authenticatedUid(req); }
    catch (e) { return problem(401, "unauthorized", e.message || "Please sign in again."); }

    const authUser = await firebaseAdmin.auth().getUser(uid);
    const accountEmail = String(body.email || authUser.email || "").trim().toLowerCase();
    const phone = normaliseProfilePhone(body.phone);
    if (body.phone && !phone) return problem(400, "phone", "Enter a valid phone number with 10–15 digits.");
    const displayName = String(body.displayName || authUser.displayName || "").trim().slice(0, 80);
    const referralCode = String(body.referralCode || "").trim().toUpperCase();
    const userRef = firestore.collection("users").doc(uid);
    const eventRef = firestore.collection("referralEvents").doc(uid);

    for (let attempt = 0; attempt < 3; attempt++) {
      const generatedCode = makeReferralCode();
      const ownCodeRef = firestore.collection("referralCodes").doc(generatedCode);
      try {
        const result = await firestore.runTransaction(async function (tx) {
          const userSnap = await tx.get(userRef);
          const codeSnap = await tx.get(ownCodeRef);
          if (codeSnap.exists && codeSnap.data().uid !== uid) throw new Error("REFERRAL_CODE_COLLISION");

          if (userSnap.exists) {
            const existing = userSnap.data();
            const patch = { updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() };
            if (displayName) patch.displayName = displayName;
            if (phone) patch.phone = phone;
            tx.set(userRef, patch, { merge: true });
            return Object.assign({}, existing, patch, { alreadyRegistered: true, referralRewardDelta: 0 });
          }

          const newUser = {
            uid: uid,
            email: accountEmail,
            displayName: displayName,
            phone: phone,
            referralCode: generatedCode,
            pendingReferralCode: /^[A-Z0-9]{8,12}$/.test(referralCode) ? referralCode : "",
            referredBy: null,
            referralCount: 0,
            referralRewardTotal: 0,
            walletBalance: 0,
            createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
          };
          tx.create(userRef, newUser);
          tx.create(ownCodeRef, { uid: uid, createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() });
          return Object.assign({}, newUser, { alreadyRegistered: false, referralRewardDelta: 0 });
        });
        return reply(200, {
          ok: true,
          uid: uid,
          email: result.email || accountEmail,
          displayName: result.displayName || displayName,
          phone: result.phone || phone,
          referralCode: result.referralCode,
          referredBy: result.referredBy || null,
          referralCount: Number(result.referralCount || 0),
          referralRewardTotal: Number(result.referralRewardTotal || 0),
          referralRewardDelta: Number(result.referralRewardDelta || 0),
          alreadyRegistered: Boolean(result.alreadyRegistered)
        });
      } catch (e) {
        if (e.message === "REFERRAL_CODE_COLLISION") continue;
        throw e;
      }
    }
    return problem(503, "referral_code", "Could not allocate a referral code. Please try again.");
  }

  async function claimReferral(req, body) {
    let uid;
    try { uid = await authenticatedUid(req); }
    catch (e) { return problem(401, "unauthorized", e.message || "Please sign in."); }

    const enteredPhone = cleanPhone(body.referrerPhone);
    const referralCode = String(body.referralCode || "").trim().toUpperCase();
    if (!enteredPhone) return problem(400, "phone", "Enter the referrer's valid 10-digit mobile number.");
    if (!/^[A-Z0-9]{8,12}$/.test(referralCode)) return problem(400, "referral_code", "Open the invitation link again, then confirm the referral.");
    if (!firebaseAdmin || !firestore) return problem(503, "firebase_not_configured", "Referral service is unavailable.");

    const userRef = firestore.collection("users").doc(uid);
    const codeRef = firestore.collection("referralCodes").doc(referralCode);
    const eventRef = firestore.collection("referralEvents").doc(uid);

    try {
      const result = await firestore.runTransaction(async function (tx) {
        const userSnap = await tx.get(userRef);
        const codeSnap = await tx.get(codeRef);
        const eventSnap = await tx.get(eventRef);
        if (!userSnap.exists) throw new Error("PROFILE_NOT_FOUND");
        const current = userSnap.data();
        if (current.referredBy || eventSnap.exists) throw new Error("ALREADY_REFERRED");
        if (String(current.pendingReferralCode || "") !== referralCode) throw new Error("REFERRAL_NOT_ELIGIBLE");
        if (!codeSnap.exists) throw new Error("INVALID_REFERRAL");
        const referrerUid = String(codeSnap.data().uid || "");
        if (!referrerUid || referrerUid === uid) throw new Error("SELF_REFERRAL");
        const referrerRef = firestore.collection("users").doc(referrerUid);
        const referrerSnap = await tx.get(referrerRef);
        if (!referrerSnap.exists) throw new Error("INVALID_REFERRAL");
        const referrer = referrerSnap.data();
        if (cleanPhone(referrer.phone) !== enteredPhone) throw new Error("PHONE_MISMATCH");
        const currentEmail = String(current.email || "").trim().toLowerCase();
        const referrerEmail = String(referrer.email || "").trim().toLowerCase();
        if (currentEmail && referrerEmail && currentEmail === referrerEmail) throw new Error("SELF_REFERRAL");

        const newBalance = Math.max(0, Number(current.walletBalance || 0)) + 100;
        const referrerBalance = Math.max(0, Number(referrer.walletBalance || 0)) + 200;
        tx.update(userRef, {
          referredBy: referrerUid,
          pendingReferralCode: "",
          referralRewardTotal: Number(current.referralRewardTotal || 0) + 100,
          walletBalance: newBalance,
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        tx.update(referrerRef, {
          referralCount: Number(referrer.referralCount || 0) + 1,
          referralRewardTotal: Number(referrer.referralRewardTotal || 0) + 200,
          walletBalance: referrerBalance,
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        tx.create(firestore.collection("walletLedger").doc("REF_NEW_" + uid), {
          uid: uid, type: "referral_reward", amount: 100, direction: "credit",
          balanceAfter: newBalance, relatedUid: referrerUid,
          createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        tx.create(firestore.collection("walletLedger").doc("REF_REF_" + uid), {
          uid: referrerUid, type: "referral_reward", amount: 200, direction: "credit",
          balanceAfter: referrerBalance, relatedUid: uid,
          createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        tx.create(eventRef, {
          referredUid: uid, referrerUid: referrerUid, referralCode: referralCode,
          referrerPhoneLast4: enteredPhone.slice(-4),
          newUserReward: 100, referrerReward: 200,
          createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
        return { newUserBalance: newBalance, referrerReward: 200, newUserReward: 100 };
      });
      return reply(200, { ok: true, claimed: true, newUserReward: result.newUserReward, message: "Referral confirmed. 100 tokens have been credited to your account; the referrer receives 200 tokens." });
    } catch (e) {
      const map = {
        PROFILE_NOT_FOUND: [404, "profile_not_found", "Your account profile is not ready."],
        ALREADY_REFERRED: [409, "already_referred", "This account has already used a referral."],
        REFERRAL_NOT_ELIGIBLE: [409, "referral_not_eligible", "This account was not created through this invitation link, so it is not eligible for this referral reward."],
        INVALID_REFERRAL: [400, "invalid_referral", "This invitation link is not valid."],
        SELF_REFERRAL: [400, "self_referral", "You cannot refer yourself."],
        PHONE_MISMATCH: [400, "phone_mismatch", "That mobile number does not match the person who invited you."]
      };
      const item = map[e.message];
      if (item) return problem(item[0], item[1], item[2]);
      throw e;
    }
  }

  async function declineReferral(req) {
    let uid;
    try { uid = await authenticatedUid(req); }
    catch (e) { return problem(401, "unauthorized", e.message || "Please sign in."); }
    const userRef = firestore.collection("users").doc(uid);
    try {
      await firestore.runTransaction(async function (tx) {
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new Error("PROFILE_NOT_FOUND");
        const data = snap.data();
        if (data.referredBy) throw new Error("ALREADY_REFERRED");
        tx.update(userRef, {
          pendingReferralCode: "",
          referralDeclinedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
      });
      return reply(200, { ok: true, declined: true });
    } catch (e) {
      if (e.message === "PROFILE_NOT_FOUND") return problem(404, "profile_not_found", "Your account profile is not ready.");
      if (e.message === "ALREADY_REFERRED") return problem(409, "already_referred", "This account has already used a referral.");
      throw e;
    }
  }

  async function walletMe(req) {
    let uid;
    try { uid = await authenticatedUid(req); }
    catch (e) { return problem(401, "unauthorized", e.message || "Please sign in."); }
    const snap = await firestore.collection("users").doc(uid).get();
    if (!snap.exists) return problem(404, "profile_not_found", "Your account profile is not ready.");
    const data = snap.data();
    const ledgerSnap = await firestore.collection("walletLedger").where("uid", "==", uid).limit(50).get();
    return reply(200, {
      uid: uid,
      balance: Math.max(0, Number(data.walletBalance || 0)),
      transactions: ledgerSnap.docs.map(function (doc) { const row = doc.data(); return { id: doc.id, type: row.type, amount: Number(row.amount || 0), direction: row.direction, balanceAfter: Number(row.balanceAfter || 0), createdAt: row.createdAt && row.createdAt.toDate ? row.createdAt.toDate().toISOString() : null }; })
    });
  }

  async function referralMe(req) {
    let uid;
    try { uid = await authenticatedUid(req); }
    catch (e) { return problem(401, "unauthorized", e.message || "Please sign in."); }
    const snap = await firestore.collection("users").doc(uid).get();
    if (!snap.exists) return problem(404, "profile_not_found", "Your account profile is not ready. Please sign out and sign in again.");
    const user = snap.data();
    return reply(200, {
      referralCode: user.referralCode || "",
      referralCount: Number(user.referralCount || 0),
      referralRewardTotal: Number(user.referralRewardTotal || 0),
      referred: Boolean(user.referredBy)
    });
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
    
    if (route === "/api/firebase-config" && req.method === "GET") {
      const config = firebaseConfig();
      return send(res, 200, config);
    }
    if (route === "/api/account/bootstrap" && req.method === "POST") {
      const body = await jsonBody(req);
      if (!body) return send(res, 400, { error: "body", message: "Send account details as JSON." });
      const r = await bootstrapAccount(req, body);
      return send(res, r.status, r.body);
    }
    if (route === "/api/referrals/decline" && req.method === "POST") {
      const r = await declineReferral(req);
      return send(res, r.status, r.body);
    }
    if (route === "/api/referrals/claim" && req.method === "POST") {
      const body = await jsonBody(req);
      if (!body) return send(res, 400, { error: "body", message: "Send referral details as JSON." });
      const r = await claimReferral(req, body);
      return send(res, r.status, r.body);
    }
    if (route === "/api/wallet/me" && req.method === "GET") {
      const r = await walletMe(req);
      return send(res, r.status, r.body);
    }
    if (route === "/api/referrals/me" && req.method === "GET") {
      const r = await referralMe(req);
      return send(res, r.status, r.body);
    }
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
