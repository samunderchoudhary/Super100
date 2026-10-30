# Razorpay payments

This project uses **Razorpay only** for online token deposits.

## 1. Get Razorpay TEST API keys
1. Sign in at https://dashboard.razorpay.com.
2. Open Account & Settings → API Keys.
3. Generate test keys and copy the Key ID (`rzp_test_...`) and Key Secret.

## 2. Configure the server
1. Open the `server` folder.
2. Copy `.env.example` to `.env` if `.env` does not already exist.
3. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `server/.env`.
4. Keep `.env` private. Never paste the secret into frontend JavaScript or publish it in a ZIP/repository.
5. Install Node.js 18 or newer.
6. From the project folder run: `node server/razorpay-server.js`
7. Open http://localhost:3000. Do not open `index.html` directly.

## 3. Test and go live
1. Test the complete payment flow with Razorpay test mode first.
2. Complete Razorpay's business verification/KYC and obtain live API keys if your business and use case are approved.
3. Replace the test keys in `server/.env` with live keys and configure `PUBLIC_URL` to your HTTPS domain.
4. Keep the payment server running on a secure HTTPS host.
5. Configure Razorpay webhooks for your production deployment and validate webhook signatures before using webhook events to update balances.

## Important payment behaviour
- The browser sends Razorpay's order, payment and signature details to the server.
- The server verifies the HMAC signature and checks the payment status with Razorpay before reporting `PAID`.
- Tokens must only be credited after a verified `PAID` result.
- A failed verification remains pending/failed; it must never be treated as successful.
- The API secret must remain on the server and must not be committed to source control.

## UPI QR-only checkout
- Choosing **UPI / QR** creates a new Razorpay `upi_qr` code for the exact purchase amount.
- The checkout displays only the QR image and amount; it does not display or ask the customer to copy a UPI ID.
- Each QR is single-use and fixed-amount. The browser polls the server, and the server checks Razorpay's authenticated QR/payment APIs.
- Tokens are credited only when Razorpay reports a captured payment for that QR with the exact expected INR amount.
- Razorpay QR Codes API access (`upi_qr`) must be enabled for your account. If the API is not enabled, the app shows an error and does not credit tokens.
- The supplied static QR image is retained in the assets folder but is not used for automatic token purchases: a reusable static QR cannot safely identify a specific order and amount.

## Payment confirmation troubleshooting
- The server now checks Razorpay's `payments_amount_received` field as well as the QR payment list. Razorpay documents this total as captured payments only.
- After a verified payment, the QR modal closes, the top-up modal closes, and the app returns to the Crash/main game screen with the purchased token amount credited.
- If the dashboard shows the payment as captured but the app remains pending, check that the running server's `server/.env` uses the same Razorpay account and mode (test/live) that generated the QR. Never share the Key Secret.
